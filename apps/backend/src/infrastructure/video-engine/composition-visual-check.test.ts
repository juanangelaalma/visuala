import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { it } from "vitest";

const run = promisify(execFile);
const hasBun = await run("bun", ["--version"]).then(() => true).catch(() => false);

it.skipIf(!hasBun)("keeps native Bun HTTP responses working while producer capture fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "visuala-gate-isolation-test-"));
  const gatePath = fileURLToPath(new URL("./composition-visual-check.ts", import.meta.url));
  const script = `
    import assert from "node:assert/strict";
    import { createCompositionVisualGate, CompositionVisualCheckError } from ${JSON.stringify(gatePath)};
    const server = Bun.serve({ port: 0, fetch: request => new Response(null, { status: request.method === "OPTIONS" ? 204 : 200 }) });
    const gate = createCompositionVisualGate({ cli: { check: async () => {} }, browserPath: ${JSON.stringify(join(dir, "missing-browser"))} });
    let finished = false;
    try {
      const checking = gate.check({ dir: ${JSON.stringify(dir)}, resolution: "720p", spec: {
        schemaVersion: "composition-spec@v1", style: { id: "creative-mode", version: "1" },
        format: { fps: 30, aspectRatio: "9:16", durationSeconds: 4 },
        scenes: [{ id: "opening", durationFrames: 120, modules: [] }],
      }}).then(() => { throw new Error("Capture must reject the missing browser"); }, error => {
        assert.ok(error instanceof CompositionVisualCheckError);
      }).finally(() => { finished = true; });
      const serving = (async () => {
        do {
          for (const method of ["GET", "OPTIONS"]) {
            const response = await fetch(server.url, { method });
            assert.equal(response.status, method === "OPTIONS" ? 204 : 200);
            await response.text();
          }
        } while (!finished);
      })();
      await Promise.all([checking, serving]);
    } finally { server.stop(true); }
  `;
  try {
    await run("bun", ["--eval", script], { timeout: 20_000 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 25_000);
