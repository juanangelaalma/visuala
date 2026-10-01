import { z } from "zod";
import { AIError, type AIErrorCode } from "../../domain/ai-service/errors";

export type OpenAIResponse = {
  id?: unknown;
  status?: unknown;
  model?: unknown;
  output?: unknown;
  incomplete_details?: { reason?: unknown } | null;
  usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown } | null;
};

const responseSchema = z.object({
  id: z.unknown().optional(),
  status: z.unknown().optional(),
  model: z.unknown().optional(),
  output: z.unknown().optional(),
  incomplete_details: z.object({ reason: z.unknown().optional() }).nullable().optional().catch(null),
  usage: z.object({
    input_tokens: z.unknown().optional(),
    output_tokens: z.unknown().optional(),
    total_tokens: z.unknown().optional(),
  }).nullable().optional().catch(null),
});
const eventSchema = z.object({
  type: z.unknown().optional(),
  delta: z.unknown().optional(),
  response: z.unknown().optional(),
});

export type ResponsesStreamResult = {
  body: OpenAIResponse;
  refused: boolean;
  invalidTerminal: boolean;
  cancelled: boolean;
};

export async function readResponsesStream(
  response: Response,
  requestId: string,
  signal: AbortSignal,
  onTextDelta: (delta: string) => void,
): Promise<ResponsesStreamResult> {
  let providerRequestId = response.headers.get("x-request-id");
  const failure = (code: AIErrorCode): AIError => new AIError({
    code,
    safeMessage: code === "AI_CANCELLED" ? "AI request was cancelled."
      : code === "AI_REFUSED" ? "AI provider refused the request."
        : code === "AI_INVALID_OUTPUT" ? "AI provider returned an invalid response."
          : "AI provider could not complete the request.",
    requestId,
    retryable: false,
    dispatchOutcome: "ambiguous",
    ...(providerRequestId ? { providerRequestId } : {}),
  });
  if (!response.body) throw failure("AI_INVALID_OUTPUT");
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let scanOffset = 0;
  let data: string[] = [];
  let eventName = "";
  let refused = false;
  let terminal: ResponsesStreamResult | undefined;

  const dispatch = () => {
    if (signal.aborted) throw failure("AI_CANCELLED");
    if (!data.length) { eventName = ""; return; }
    const value = data.join("\n");
    data = [];
    const name = eventName;
    eventName = "";
    if (value === "[DONE]") return;
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw failure("AI_INVALID_OUTPUT"); }
    const parsedEvent = eventSchema.safeParse(parsed);
    if (!parsedEvent.success) throw failure("AI_INVALID_OUTPUT");
    const event = parsedEvent.data;
    const type = typeof event.type === "string" ? event.type : name;
    if (event.response && typeof event.response === "object" && "id" in event.response) {
      const id = event.response.id;
      if (typeof id === "string" && id) providerRequestId = id;
    }
    if (type === "response.output_text.delta") {
      if (typeof event.delta !== "string") throw failure("AI_INVALID_OUTPUT");
      if (event.delta && !refused) onTextDelta(event.delta);
    } else if (type === "response.refusal.delta" || type === "response.refusal.done") {
      refused = true;
    } else if (type === "response.completed" || type === "response.incomplete" || type === "response.failed"
      || type === "response.cancelled" || type === "response.canceled") {
      const cancelled = type === "response.cancelled" || type === "response.canceled";
      const parsedResponse = responseSchema.safeParse(event.response);
      if (!parsedResponse.success) throw failure(cancelled ? "AI_CANCELLED" : "AI_INVALID_OUTPUT");
      const body = parsedResponse.data;
      terminal = { body, refused, cancelled, invalidTerminal: !cancelled && body.status !== type.slice("response.".length) };
    } else if (type === "error" || type === "response.error") {
      throw failure("AI_UNAVAILABLE");
    }
  };
  const line = (value: string) => {
    if (!value) { dispatch(); return; }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon === -1 ? value : value.slice(0, colon);
    let content = colon === -1 ? "" : value.slice(colon + 1);
    if (content.startsWith(" ")) content = content.slice(1);
    if (field === "data") data.push(content);
    else if (field === "event") eventName = content;
  };
  const consume = (text: string, eof = false) => {
    pending += text;
    let start = 0;
    let index = scanOffset;
    while (index < pending.length) {
      const character = pending[index];
      if (character !== "\r" && character !== "\n") { index++; continue; }
      if (character === "\r" && index === pending.length - 1 && !eof) break;
      line(pending.slice(start, index));
      index += character === "\r" && pending[index + 1] === "\n" ? 2 : 1;
      start = index;
      if (terminal) break;
    }
    pending = pending.slice(start);
    scanOffset = index - start;
  };

  try {
    if (signal.aborted) throw failure("AI_CANCELLED");
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "text/event-stream") {
      throw failure("AI_INVALID_OUTPUT");
    }
    while (!terminal) {
      const chunk = await reader.read();
      if (signal.aborted) throw failure("AI_CANCELLED");
      let decoded: string;
      try {
        decoded = chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      } catch {
        throw failure("AI_INVALID_OUTPUT");
      }
      consume(decoded, chunk.done);
      if (chunk.done && !terminal) throw failure(refused ? "AI_REFUSED" : "AI_UNAVAILABLE");
    }
    return terminal;
  } catch (error) {
    if (signal.aborted) throw failure("AI_CANCELLED");
    if (error instanceof AIError) throw error;
    throw failure("AI_UNAVAILABLE");
  } finally {
    signal.removeEventListener("abort", abort);
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
}
