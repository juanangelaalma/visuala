import { AIError } from "../domain/ai-service/errors";
import { mapDomainError, type MappedError } from "../plugins/errors";

type StreamContext = {
  signal: AbortSignal;
  emit: (event: "message" | "text-delta", data: unknown) => void;
};

export async function videoChatStream(
  request: Request,
  run: (context: StreamContext) => Promise<unknown>,
): Promise<Response> {
  const abort = new AbortController();
  const encoder = new TextEncoder();
  const queued: Uint8Array[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let ended = false;
  let cancelled = false;
  let committed = false;
  let firstFailure: MappedError | undefined;
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });

  function cleanup() {
    request.signal.removeEventListener("abort", onAbort);
  }

  function publish(event: string, data: unknown) {
    if (ended || cancelled) return;
    const record = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (controller) controller.enqueue(record);
    else queued.push(record);
    committed = true;
    releaseBarrier();
  }

  function close() {
    ended = true;
    cleanup();
    controller?.close();
  }

  function fail(error: unknown) {
    if (ended || cancelled) return;
    const mapped = safeError(error);
    if (committed) publish("error", { status: mapped.status, ...mapped.body });
    else {
      firstFailure = mapped;
      releaseBarrier();
    }
    close();
  }

  function onAbort() {
    abort.abort(request.signal.reason);
    fail(new AIError({ code: "AI_CANCELLED", safeMessage: "AI request was cancelled.", requestId: "video-chat", retryable: false }));
  }

  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) onAbort();
  else {
    void Promise.resolve().then(() => run({ signal: abort.signal, emit: publish }))
      .then((result) => {
        publish("completed", result);
        if (!ended && !cancelled) close();
      })
      .catch(fail);
  }

  await barrier;
  if (firstFailure) return Response.json(firstFailure.body, { status: firstFailure.status });

  return new Response(new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      for (const record of queued) controller.enqueue(record);
      queued.length = 0;
      if (ended) controller.close();
    },
    cancel(reason) {
      cancelled = true;
      queued.length = 0;
      abort.abort(reason);
      cleanup();
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function safeError(error: unknown) {
  return mapDomainError(error) ?? { status: 500, body: { error: "Internal server error." } };
}
