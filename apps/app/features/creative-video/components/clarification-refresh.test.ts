import { describe, expect, it, vi } from "vitest";
import { refreshAfterRevisionConflict } from "./clarification-refresh";

describe("refreshAfterRevisionConflict", () => {
  it("refreshes server state after a stale clarification answer", () => {
    const refresh = vi.fn();

    const status = refreshAfterRevisionConflict({ refreshRequired: true }, refresh);

    expect(status).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh for ordinary action errors", () => {
    const refresh = vi.fn();

    const status = refreshAfterRevisionConflict({ error: "Could not save the answer." }, refresh);

    expect(status).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
