import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type RenderWorkspace = { dir: string; dispose: () => Promise<void> };

/**
 * A fresh directory per attempt. Reusing one would let a retry render against files a previous,
 * failed attempt left behind, which is exactly how a render silently stops matching its manifest.
 */
export async function createRenderWorkspace(workRoot: string | null, jobId: string): Promise<RenderWorkspace> {
  const dir = await mkdtemp(join(workRoot ?? tmpdir(), `hyperframes-${jobId}-`));
  let disposed = false;

  return {
    dir,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}
