import { describe, expect, it } from "vitest";
import { AIError } from "../../domain/ai-service/errors";
import { createQuestionDeltaExtractor, throwIfInterviewAborted } from "./interview-stream";

describe("createQuestionDeltaExtractor", () => {
  it("publishes question text before its string or structured response is complete", () => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));

    feed('{"draft":{"audience":null},"turn":{"question":"Siapa target');
    expect(deltas).toEqual(["Siapa target"]);
    feed(" pembelinya?");
    expect(deltas).toEqual(["Siapa target", " pembelinya?"]);
    feed('","options":[{"label":"Mahasiswa"}],"control":"single_select"}}');
    expect(deltas.join("")).toBe("Siapa target pembelinya?");
  });

  it("ignores draft, array, nested-object and quoted-content question decoys", () => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));
    const source = JSON.stringify({
      question: "root decoy",
      draft: {
        question: "draft decoy",
        turn: { question: "draft turn decoy" },
        facts: [{ question: "array decoy", turn: { question: "array turn decoy" } }],
        notes: 'Quoted content: {"turn":{"question":"quoted decoy"}}',
        number: -1.25e3,
        confirmed: false,
      },
      "turn.question": "dotted-key decoy",
      other: { turn: { question: "nested decoy" } },
      turn: {
        detail: { question: "turn detail decoy" },
        options: [{ question: "turn option decoy" }],
        question: "Pertanyaan asli?",
        after: { question: "after decoy" },
      },
      after: { turn: { question: "after turn decoy" } },
    });

    for (let index = 0; index < source.length; index += 1) feed(source.charAt(index));

    expect(deltas.join("")).toBe("Pertanyaan asli?");
  });

  it.each([
    '{"draft":{"question":"decoy"},"turn":null}',
    '{"turn":[{"question":"array decoy"}]}',
    '[{"turn":{"question":"root array decoy"}}]',
    '{"turn":{"question":["not a string",{"question":"nested decoy"}]}}',
    '{"turn":{"question":{"question":"object decoy"}}}',
    '{"turn":{"question":null}}',
    '{"turn":{"question":""}}',
  ])("emits no preview for a non-question-string path: %s", (source) => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));
    for (let index = 0; index < source.length; index += 1) feed(source.charAt(index));
    expect(deltas).toEqual([]);
  });

  it("decodes escaped properties and all string escapes across every two-fragment boundary", () => {
    const source = String.raw`{"draft":{"question":"ignore \" and \\u1234"},"t\u0075rn":{"qu\u0065stion":"Kutip: \"; garis: \\; miring: \/; kontrol: \b\f\n\r\t; caf\u00e9 \uD83D\uDE80?"}}`;
    const expected = 'Kutip: "; garis: \\; miring: /; kontrol: \b\f\n\r\t; café 🚀?';

    for (let boundary = 0; boundary <= source.length; boundary += 1) {
      const deltas: string[] = [];
      const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));
      feed(source.slice(0, boundary));
      feed("");
      feed(source.slice(boundary));
      expect(deltas.join(""), `boundary ${boundary}`).toBe(expected);
      for (const delta of deltas) {
        expect(delta.charCodeAt(delta.length - 1)).not.toBe(0xd83d);
        expect(delta.charCodeAt(0)).not.toBe(0xde80);
      }
    }
  });

  it("holds incomplete escapes and surrogate pairs until the decoded character is available", () => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));

    feed('{"turn":{"question":"Pilih ');
    expect(deltas).toEqual(["Pilih "]);
    feed("\\");
    feed("uD8");
    feed("3D");
    expect(deltas).toEqual(["Pilih "]);
    feed("\\u");
    feed("DE8");
    expect(deltas).toEqual(["Pilih "]);
    feed("0");
    expect(deltas).toEqual(["Pilih ", "🚀"]);
    feed("\\");
    expect(deltas).toEqual(["Pilih ", "🚀"]);
    feed('" sekarang?"}}');
    expect(deltas).toEqual(["Pilih ", "🚀", '" sekarang?']);
  });

  it("keeps a raw Unicode surrogate pair atomic when split between feeds", () => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));

    feed('{"turn":{"question":"Foto ' + "🚀".charAt(0));
    expect(deltas).toEqual(["Foto "]);
    feed("🚀".charAt(1) + '?"}}');
    expect(deltas).toEqual(["Foto ", "🚀?"]);
  });

  it("preserves an unpaired escaped surrogate once the following character or string end resolves it", () => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));

    feed(String.raw`{"turn":{"question":"\ud83d`);
    expect(deltas).toEqual([]);
    feed("x");
    expect(deltas).toEqual(["\ud83dx"]);
    feed(String.raw`\ud800`);
    expect(deltas).toEqual(["\ud83dx"]);
    feed('"}}');
    expect(deltas.join("")).toBe("\ud83dx\ud800");
  });

  it("never publishes the unfinished suffix of a truncated JSON escape", () => {
    const deltas: string[] = [];
    const feed = createQuestionDeltaExtractor((delta) => deltas.push(delta));
    feed('{"turn":{"question":"Siapa ');
    feed("\\u00");
    expect(deltas).toEqual(["Siapa "]);
  });
});

describe("throwIfInterviewAborted", () => {
  it("rejects an aborted interview with safe cancellation metadata rather than its private reason", () => {
    const controller = new AbortController();
    controller.abort(new Error("private cancellation reason"));

    let failure: unknown;
    try {
      throwIfInterviewAborted(controller.signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AIError);
    expect(failure).toMatchObject({
      code: "AI_CANCELLED",
      safeMessage: "AI request was cancelled.",
      retryable: false,
    });
    expect((failure as AIError).message).not.toContain("private cancellation reason");
  });
});
