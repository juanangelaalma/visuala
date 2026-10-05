type TraceContext = { projectId?: string; jobId?: string; requestId?: string; sourceFile: string };
type TraceFields = { attempt?: number; issueCodes?: readonly string[] };

export function processTrace(context: TraceContext) {
  return {
    response(stage: string, response: unknown) {
      if (process.env.AI_LOG_RESPONSES?.trim().toLowerCase() !== "true") return;
      console.info(JSON.stringify({ timestamp: new Date().toISOString(), event: "video_ai_response", ...context, stage, response }));
    },
    event(stage: string, status: string, fields: TraceFields = {}) {
      console.info(JSON.stringify({ timestamp: new Date().toISOString(), event: "video_process", ...context, stage, status, ...fields }));
    },
    async run<T>(stage: string, operation: () => Promise<T>): Promise<T> {
      const startedAt = Date.now();
      console.info(JSON.stringify({ timestamp: new Date().toISOString(), event: "video_process", ...context, stage, status: "started" }));
      try {
        const result = await operation();
        console.info(JSON.stringify({ timestamp: new Date().toISOString(), event: "video_process", ...context, stage, status: "completed", durationMs: Date.now() - startedAt }));
        return result;
      } catch (error: unknown) {
        const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "unexpected_error";
        console.error(JSON.stringify({ timestamp: new Date().toISOString(), event: "video_process", ...context, stage, status: "failed", durationMs: Date.now() - startedAt, code }));
        throw error;
      }
    },
  };
}
