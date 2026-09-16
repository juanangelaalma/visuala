import { describe, expect, it, vi } from "vitest";
import { pollCreativeProjectStatus, workspaceViewAfterKey } from "./creative-workspace-interactions";

describe("pollCreativeProjectStatus", () => {
  it("refreshes when the server revision advances", async () => {
    const refresh = vi.fn();

    const result = await pollCreativeProjectStatus({ projectId: "project-1", revision: 2, fetchStatus: vi.fn().mockResolvedValue(okResponse(3)), refresh });

    expect(result).toBe("refreshed");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("returns a retry state when polling rejects", async () => {
    const result = await pollCreativeProjectStatus({ projectId: "project-1", revision: 2, fetchStatus: vi.fn().mockRejectedValue(new Error("network")), refresh: vi.fn() });

    expect(result).toBe("retry");
  });

  it("returns a retry state for non-OK responses", async () => {
    const result = await pollCreativeProjectStatus({ projectId: "project-1", revision: 2, fetchStatus: vi.fn().mockResolvedValue({ ok: false }), refresh: vi.fn() });

    expect(result).toBe("retry");
  });
});

describe("workspaceViewAfterKey", () => {
  it("moves to preview with ArrowRight", () => {
    expect(workspaceViewAfterKey("chat", "ArrowRight")).toBe("preview");
  });

  it("moves to chat with ArrowLeft", () => {
    expect(workspaceViewAfterKey("preview", "ArrowLeft")).toBe("chat");
  });

  it.each([["Home", "chat"], ["End", "preview"]] as const)("moves with %s", (key, expected) => {
    expect(workspaceViewAfterKey("chat", key)).toBe(expected);
  });
});

function okResponse(revision: number) {
  return { ok: true, json: vi.fn().mockResolvedValue({ revision }) };
}
