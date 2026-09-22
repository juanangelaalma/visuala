import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRenderWorkspace } from "./workspace";

describe("createRenderWorkspace", () => {
  it("creates a unique directory under the configured root and removes it on dispose", async () => {
    const workspace = await createRenderWorkspace(process.env.TMPDIR ?? "/tmp", "job-1");
    expect(existsSync(workspace.dir)).toBe(true);
    expect(workspace.dir).toContain("job-1");

    await workspace.dispose();
    expect(existsSync(workspace.dir)).toBe(false);
  });

  it("never reuses another job's directory, so a stale render cannot read the wrong files", async () => {
    const first = await createRenderWorkspace(null, "job-1");
    const second = await createRenderWorkspace(null, "job-1");
    expect(first.dir).not.toBe(second.dir);
    await first.dispose();
    await second.dispose();
  });

  it("tolerates disposing twice, because cleanup runs in a finally", async () => {
    const workspace = await createRenderWorkspace(null, "job-1");
    await workspace.dispose();
    await expect(workspace.dispose()).resolves.toBeUndefined();
  });
});
