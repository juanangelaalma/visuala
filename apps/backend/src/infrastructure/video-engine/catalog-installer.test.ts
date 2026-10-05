import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalogInstaller, toSubComposition } from "./catalog-installer";
import type { HyperframesCli } from "./hyperframes-cli";

const BLOCK_DOCUMENT = `<!doctype html>
<html lang="en" data-resolution="portrait" data-composition-variables='[{"id":"titleLine1","type":"string"}]'>
<head>
<style>.card { color: #0a1418; }</style>
</head>
<body>
<div data-composition-id="heygen-avatar-promo-card" data-duration="10">
  <p class="card">hello</p>
</div>
<script>window.__timelines["heygen-avatar-promo-card"] = {};</script>
</body>
</html>`;

describe("toSubComposition", () => {
  it("wraps the document in a template with its head styles and scripts inside", () => {
    const result = toSubComposition(BLOCK_DOCUMENT);

    expect(result.startsWith("<template>")).toBe(true);
    expect(result.trimEnd().endsWith("</template>")).toBe(true);
    expect(result).toContain("<style>.card { color: #0a1418; }</style>");
    expect(result).toContain('window.__timelines["heygen-avatar-promo-card"]');
    expect(result).toContain('data-composition-id="heygen-avatar-promo-card"');
    expect(result).not.toContain("<!doctype");
  });

  it("moves the page-level composition variables onto the composition root", () => {
    const result = toSubComposition(BLOCK_DOCUMENT);

    expect(result).toContain('data-composition-variables=\'[{"id":"titleLine1","type":"string"}]\'');
    expect(result.indexOf("data-composition-variables")).toBeGreaterThan(result.indexOf('data-composition-id="heygen-avatar-promo-card"'));
  });

  it("keeps a root that already declares its variables", () => {
    const document = '<html><body><div data-composition-id="x" data-composition-variables="[]"></div></body></html>';
    const result = toSubComposition(document);

    expect(result.match(/data-composition-variables/g)).toHaveLength(1);
  });
});

describe("createCatalogInstaller", () => {
  it("installs a block and reports its text and binary files", async () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-install-"));
    const cli = fakeCli(root, {
      "compositions/heygen-avatar-promo-card.html": BLOCK_DOCUMENT,
      "assets/av_r1k1.mp4": new Uint8Array([1, 2, 3, 4]),
    });

    const blocks = await createCatalogInstaller({ cli }).install([{ name: "heygen-avatar-promo-card", vars: { titleLine1: "Julumpia" } }], root);
    const block = blocks.get("heygen-avatar-promo-card");

    expect(block?.entryPath).toBe("compositions/heygen-avatar-promo-card.html");
    expect(block?.entryContents).toContain("<template>");
    expect(block?.files.map((entry) => entry.path)).toEqual(["assets/av_r1k1.mp4"]);
    expect(block?.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(block?.files[0]?.sourcePath.endsWith("assets/av_r1k1.mp4")).toBe(true);
    expect(cli.calls[0]).toMatchObject({ name: "heygen-avatar-promo-card", vars: { titleLine1: "Julumpia" } });
  });

  it("refuses a block with no entry file", async () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-install-"));
    const cli = fakeCli(root, { "assets/only.mp4": new Uint8Array([1]) });

    await expect(createCatalogInstaller({ cli }).install([{ name: "broken" }], root)).rejects.toMatchObject({ code: "cli_unreadable" });
  });

  it("installs each name once", async () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-install-"));
    const cli = fakeCli(root, { "compositions/a.html": BLOCK_DOCUMENT });

    await createCatalogInstaller({ cli }).install([{ name: "a" }, { name: "a" }], root);

    expect(cli.calls).toHaveLength(1);
  });
});

function fakeCli(root: string, files: Record<string, string | Uint8Array>): HyperframesCli & { calls: { name: string; vars?: Record<string, string> }[] } {
  const calls: { name: string; vars?: Record<string, string> }[] = [];
  return {
    calls,
    async add({ name, dir, vars }) {
      calls.push({ name, ...(vars ? { vars: { ...vars } } : {}) });
      const written: string[] = [];
      for (const [relative, contents] of Object.entries(files)) {
        const target = join(dir, relative);
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, contents);
        written.push(target);
      }
      return { ok: true, name, type: "hyperframes:block", written, installed: [name], snippet: `<div data-composition-src="${Object.keys(files)[0]}"></div>`, warnings: [] };
    },
    async check() {
      throw new Error("Catalog installation must not run the composition gate.");
    },
  };
}
