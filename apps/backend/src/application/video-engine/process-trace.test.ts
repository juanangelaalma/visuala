import { afterEach, describe, expect, it, vi } from "vitest";
import { processTrace } from "./process-trace";

afterEach(() => vi.restoreAllMocks());

describe("processTrace", () => {
  it("includes the source file and correlation ids in structured stage logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const trace = processTrace({
      projectId: "project-1",
      requestId: "request-1",
      sourceFile: "apps/backend/src/application/video-engine/compose.ts",
    });

    await trace.run("composition", async () => "done");

    const lines = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      event: "video_process",
      projectId: "project-1",
      requestId: "request-1",
      sourceFile: "apps/backend/src/application/video-engine/compose.ts",
      stage: "composition",
      status: "started",
    });
    expect(lines[1]).toMatchObject({
      sourceFile: "apps/backend/src/application/video-engine/compose.ts",
      stage: "composition",
      status: "completed",
    });
  });
});
