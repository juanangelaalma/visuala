import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPOSITION_SPEC_VERSION } from "./composition";
import { buildComposition } from "./compiler";
import { parseDesignPackManifest } from "./design-pack";
import type { CompiledBlock, CompileInput } from "./compiler";
import type { CompositionSpec } from "./composition";

const designPack = parseDesignPackManifest(
  JSON.parse(readFileSync(resolve(process.cwd(), "design-packs/creative-mode/v1/manifest.json"), "utf8")),
);

const ASSETS = [
  { id: "asset-1", objectKey: "video-projects/p/assets/asset-1.jpg", sha256: "a".repeat(64), mimeType: "image/jpeg", fileName: "asset-1.jpg" },
  { id: "asset-2", objectKey: "video-projects/p/assets/asset-2.jpg", sha256: "b".repeat(64), mimeType: "image/jpeg", fileName: "asset-2.jpg" },
];

const BLOCK: CompiledBlock = {
  name: "heygen-avatar-promo-card",
  entryPath: "compositions/heygen-avatar-promo-card.html",
  entryContents: "<template><style>.x{color:red}</style><div data-composition-id=\"heygen-avatar-promo-card\"></div></template>",
  files: [{ path: "assets/av_r1k1.mp4", sha256: "c".repeat(64), sourcePath: "/scratch/block/assets/av_r1k1.mp4" }],
};

function spec(overrides: Partial<CompositionSpec> = {}): CompositionSpec {
  return {
    schemaVersion: COMPOSITION_SPEC_VERSION,
    format: { aspectRatio: "9:16", fps: 30, durationSeconds: 12 },
    style: { id: "creative-mode", version: "1" },
    scenes: [
      { id: "scene_1", transition: "cut", durationFrames: 180, modules: [{ id: "ProductHero", kind: "internal", content: { assetId: "asset-1" } }] },
      { id: "scene_2", durationFrames: 180, modules: [{ id: "Headline", kind: "internal", content: { text: "Julumpia" } }] },
    ],
    ...overrides,
  };
}

function input(overrides: Partial<CompileInput> = {}): CompileInput {
  return { html: "<!doctype html>\n<html><body>AI composition</body></html>\n", spec: spec(), designPack, assets: ASSETS, blocks: new Map(), resolution: "1080p", language: "id", ...overrides };
}

describe("buildComposition", () => {
  it("packages AI HTML unchanged without generating CSS, scripts, or a ledger", () => {
    const html = "<!DOCTYPE html>\r\n<html><head><style>body{color:red}</style></head><body><script>window.a=1</script></body></html>\n";
    expect(buildComposition(input({ html })).files).toEqual([{ path: "index.html", contents: html }]);
  });

  it("packages every supplied approved asset, including those absent from the spec", () => {
    expect(buildComposition(input()).assets).toEqual(ASSETS.map((asset) => ({
      path: `assets/${asset.fileName}`, objectKey: asset.objectKey, sha256: asset.sha256,
    })));
  });

  it("refuses a catalog instance that was not installed", () => {
    const withBlock = spec({
      scenes: [{ id: "scene_1", durationFrames: 180, modules: [{ id: "missing-block", kind: "catalog", content: {} }] }],
    });

    expect(() => buildComposition(input({ spec: withBlock }))).toThrow(/was not installed/);
  });

  it("refuses two blocks that provide the same file", () => {
    const other: CompiledBlock = { ...BLOCK, name: "other-block", entryPath: "compositions/other.html", entryContents: "<template></template>" };
    const both = spec({
      scenes: [
        { id: "scene_1", durationFrames: 180, modules: [{ id: "heygen-avatar-promo-card", kind: "catalog", content: {} }] },
        { id: "scene_2", durationFrames: 180, modules: [{ id: "other-block", kind: "catalog", content: {} }] },
      ],
    });

    expect(() =>
      buildComposition(input({ spec: both, blocks: new Map([["heygen-avatar-promo-card", BLOCK], ["other-block", other]]) })),
    ).toThrow(/Multiple files provide/);
  });

  it("rejects block files that overwrite the AI entry or approved assets", () => {
    const withBlock = spec({
      scenes: [{ id: "scene_1", durationFrames: 360, modules: [{ id: BLOCK.name, kind: "catalog", content: {} }] }],
    });
    expect(() => buildComposition(input({
      spec: withBlock, blocks: new Map([[BLOCK.name, { ...BLOCK, entryPath: "index.html" }]]),
    }))).toThrow(/Multiple files provide index.html/);
    expect(() => buildComposition(input({
      spec: withBlock, blocks: new Map([[BLOCK.name, { ...BLOCK, files: [{ ...BLOCK.files[0]!, path: "assets/asset-1.jpg" }] }]]),
    }))).toThrow(/Multiple files provide assets\/asset-1.jpg/);
  });

  it("packages catalog entry HTML and binary files without writing hosts into AI HTML", () => {
    const withBlock = spec({
      scenes: [{ id: "scene_1", durationFrames: 360, modules: [{ id: BLOCK.name, kind: "catalog", content: {} }] }],
    });
    const compiled = buildComposition(input({ spec: withBlock, blocks: new Map([[BLOCK.name, BLOCK]]) }));
    expect(compiled.files).toEqual([
      { path: "index.html", contents: input().html },
      { path: BLOCK.entryPath, contents: BLOCK.entryContents },
    ]);
    expect(compiled.binaries).toEqual(BLOCK.files);
  });


  it("is content-addressed: the same input hashes the same, a changed input does not", () => {
    const first = buildComposition(input());
    const second = buildComposition(input());
    expect(second.compositionHash).toBe(first.compositionHash);
    expect(first.compositionHash).toMatch(/^[0-9a-f]{64}$/);

    const changedHtml = buildComposition(input({ html: `${input().html}<!-- changed -->` }));
    expect(changedHtml.compositionHash).not.toBe(first.compositionHash);

    const changedText = spec();
    changedText.scenes[1]!.modules[0]!.content.text = "Julumpia Baru";
    expect(buildComposition(input({ spec: changedText })).compositionHash).not.toBe(first.compositionHash);

    const changedAsset = ASSETS.map((asset) => (asset.id === "asset-2" ? { ...asset, sha256: "d".repeat(64) } : asset));
    expect(buildComposition(input({ assets: changedAsset })).compositionHash).not.toBe(first.compositionHash);

    expect(buildComposition(input({ resolution: "720p" })).compositionHash).not.toBe(first.compositionHash);
    expect(buildComposition(input({ assets: [...ASSETS].reverse() })).compositionHash).toBe(first.compositionHash);
  });

  it("hashes changes to pinned font and design metadata", () => {
    const original = buildComposition(input()).compositionHash;
    const changedPack = { ...designPack, fonts: designPack.fonts.map((font, index) => index === 0 ? { ...font, weight: font.weight === 400 ? 500 : 400 } : font) };
    expect(buildComposition(input({ designPack: changedPack })).compositionHash).not.toBe(original);
  });

  it("hashes installed block entry and binary bytes", () => {
    const withBlock = spec({
      scenes: [{ id: "scene_1", durationFrames: 360, modules: [{ id: BLOCK.name, kind: "catalog", content: {} }] }],
    });
    const base = input({ spec: withBlock, blocks: new Map([[BLOCK.name, BLOCK]]) });
    const original = buildComposition(base).compositionHash;
    expect(buildComposition({ ...base, blocks: new Map([[BLOCK.name, { ...BLOCK, entryContents: "<template>changed</template>" }]]) }).compositionHash).not.toBe(original);
    expect(buildComposition({ ...base, blocks: new Map([[BLOCK.name, { ...BLOCK, files: [{ ...BLOCK.files[0]!, sha256: "d".repeat(64) }] }]]) }).compositionHash).not.toBe(original);
  });
});
