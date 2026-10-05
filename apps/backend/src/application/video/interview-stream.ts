import { AIError } from "../../domain/ai-service/errors";

export type InterviewStreamOptions = {
  abortSignal?: AbortSignal;
  onQuestionDelta?: (delta: string) => void;
};

export function throwIfInterviewAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AIError({
      code: "AI_CANCELLED",
      safeMessage: "AI request was cancelled.",
      requestId: "video-interview",
      retryable: false,
    });
  }
}

export function createQuestionDeltaExtractor(onDelta: (delta: string) => void): (jsonDelta: string) => void {
  const tokenizer = new QuestionTokenizer(onDelta);
  return (jsonDelta) => tokenizer.feed(jsonDelta);
}

type ContainerPath = "root" | "turn" | "other";
type Container = {
  kind: "object" | "array";
  path: ContainerPath;
  state: "key" | "colon" | "value" | "separator";
  key: string;
};
type StringRole = "key" | "question" | "ignored";

const JSON_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t",
};

// This only extracts a provisional string. The final response still needs full schema validation.
class QuestionTokenizer {
  private readonly containers: Container[] = [];
  private rootConsumed = false;
  private stopped = false;
  private primitive = false;
  private stringRole: StringRole | null = null;
  private keyText = "";
  private escaped = false;
  private unicodeRemaining = 0;
  private unicodeValue = 0;
  private highSurrogate = "";
  private output = "";

  constructor(private readonly onDelta: (delta: string) => void) {}

  feed(fragment: string): void {
    for (let index = 0; index < fragment.length && !this.stopped; index += 1) {
      const character = fragment.charAt(index);
      if (this.stringRole !== null) this.consumeString(character);
      else this.consumeSyntax(character);
    }
    const delta = this.output;
    this.output = "";
    if (delta) this.onDelta(delta);
  }

  private consumeSyntax(character: string): void {
    const whitespace = character === " " || character === "\t" || character === "\n" || character === "\r";
    if (this.primitive) {
      if (!whitespace && character !== "," && character !== "}" && character !== "]") return;
      this.primitive = false;
    }
    if (whitespace) return;
    const container = this.containers.at(-1);
    if (container?.state === "separator") {
      this.consumeSeparator(character, container);
    } else if (container?.state === "key") {
      if (character === "}") this.containers.pop();
      else if (character === '"') this.startString("key");
      else this.stopped = true;
    } else if (container?.state === "colon") {
      if (character === ":") container.state = "value";
      else this.stopped = true;
    } else if (container?.kind === "array" && character === "]") {
      this.containers.pop();
    } else {
      this.consumeValue(character, container);
    }
  }

  private consumeSeparator(character: string, container: Container): void {
    if (character === (container.kind === "object" ? "}" : "]")) {
      this.containers.pop();
    } else if (character === ",") {
      container.state = container.kind === "object" ? "key" : "value";
      container.key = "";
    } else {
      this.stopped = true;
    }
  }

  private consumeValue(character: string, parent: Container | undefined): void {
    if (!parent && this.rootConsumed) {
      this.stopped = true;
      return;
    }
    const path = !parent && character === "{" ? "root"
      : parent?.path === "root" && parent.kind === "object" && parent.key === "turn" && character === "{"
        ? "turn" : "other";
    const isQuestion = parent?.path === "turn" && parent.kind === "object" && parent.key === "question";
    if (parent) parent.state = "separator";
    else this.rootConsumed = true;
    if (character === "{" || character === "[") {
      this.containers.push({ kind: character === "{" ? "object" : "array", path, state: character === "{" ? "key" : "value", key: "" });
    } else if (character === '"') {
      this.startString(isQuestion ? "question" : "ignored");
    } else if (character === "n" || character === "t" || character === "f" || character === "-" || (character >= "0" && character <= "9")) {
      this.primitive = true;
    } else {
      this.stopped = true;
    }
  }

  private startString(role: StringRole): void {
    this.stringRole = role;
    this.keyText = "";
    this.highSurrogate = "";
    this.escaped = false;
    this.unicodeRemaining = 0;
  }

  private consumeString(character: string): void {
    if (this.unicodeRemaining > 0) {
      this.consumeUnicode(character);
    } else if (this.escaped) {
      this.consumeEscape(character);
    } else if (character === "\\") {
      this.escaped = true;
    } else if (character === '"') {
      this.finishString();
    } else if (character.charCodeAt(0) < 0x20) {
      this.stopped = true;
    } else {
      this.appendDecoded(character);
    }
  }

  private consumeEscape(character: string): void {
    this.escaped = false;
    if (character === "u") {
      this.unicodeRemaining = 4;
      this.unicodeValue = 0;
      return;
    }
    const decoded = JSON_ESCAPES[character];
    if (decoded === undefined) this.stopped = true;
    else this.appendDecoded(decoded);
  }

  private consumeUnicode(character: string): void {
    const digit = hexDigit(character);
    if (digit < 0) {
      this.stopped = true;
      return;
    }
    this.unicodeValue = this.unicodeValue * 16 + digit;
    this.unicodeRemaining -= 1;
    if (this.unicodeRemaining === 0) this.appendDecoded(String.fromCharCode(this.unicodeValue));
  }

  private appendDecoded(character: string): void {
    if (this.stringRole === "ignored") return;
    const code = character.charCodeAt(0);
    if (this.highSurrogate) {
      const high = this.highSurrogate;
      this.highSurrogate = "";
      if (code >= 0xdc00 && code <= 0xdfff) {
        this.appendText(high + character);
        return;
      }
      this.appendText(high);
    }
    // Hold a high surrogate even across feeds so a paired character is published atomically.
    if (code >= 0xd800 && code <= 0xdbff) this.highSurrogate = character;
    else this.appendText(character);
  }

  private appendText(text: string): void {
    if (this.stringRole === "key") this.keyText += text;
    else if (this.stringRole === "question") this.output += text;
  }

  private finishString(): void {
    if (this.highSurrogate) this.appendText(this.highSurrogate);
    this.highSurrogate = "";
    if (this.stringRole === "key") {
      const container = this.containers.at(-1);
      if (container) {
        container.key = this.keyText;
        container.state = "colon";
      }
    }
    this.stringRole = null;
  }
}

function hexDigit(character: string): number {
  const code = character.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 65 + 10;
  if (code >= 97 && code <= 102) return code - 97 + 10;
  return -1;
}
