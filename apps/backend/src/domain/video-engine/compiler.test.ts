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
  return { spec: spec(), designPack, assets: ASSETS, blocks: new Map(), resolution: "1080p", language: "id", ...overrides };
}

function file(compiled: ReturnType<typeof buildComposition>, path: string): string {
  const found = compiled.files.find((candidate) => candidate.path === path);
  if (!found) throw new Error(`no file ${path}: ${compiled.files.map((candidate) => candidate.path).join(", ")}`);
  return found.contents;
}

describe("buildComposition", () => {
  it("builds a sized, seekable document with one scene clip per scene", () => {
    const compiled = buildComposition(input());
    const html = file(compiled, "index.html");

    expect(compiled.compositionId).toBe("main");
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
    expect(html).toContain('data-duration="12"');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('data-start="6"');
    expect(html).toContain('data-scene="scene_2"');
    expect(html).toContain("gsap.timeline({ paused: true })");
    expect(html).toContain('window.__timelines["main"]');
  });

  it("inlines the design tokens, the font faces, and each module's css", () => {
    const css = file(buildComposition(input()), "styles.css");

    expect(css).toContain("--hf-cream: #EFE9D9;");
    expect(css).toContain('@font-face');
    expect(css).toContain("archivo-black-latin-400-normal.woff2");
    expect(css).toContain(".hf-Headline__text");
    expect(css).toContain("container-type: size");
    expect(css).not.toContain(".hf-CTA");
  });

  it("lists only the fonts and assets the composition actually uses", () => {
    const compiled = buildComposition(input());

    expect(compiled.fonts.map((font) => font.path)).toContain("fonts/archivo-black-latin-400-normal.woff2");
    expect(compiled.assets.map((asset) => asset.path)).toEqual(["assets/asset-1.jpg"]);
    expect(compiled.moduleVersions).toEqual({ ProductHero: "1.0.0", Headline: "1.0.0" });
  });

  it("wires a catalog item as a sub-composition host and carries its file and binaries", () => {
    const compiled = buildComposition(
      input({
        spec: spec({
          scenes: [
            { id: "scene_1", durationFrames: 180, modules: [{ id: "ProductHero", kind: "internal", content: { assetId: "asset-1" } }] },
            { id: "scene_2", durationFrames: 180, modules: [{ id: "heygen-avatar-promo-card", kind: "catalog", content: { titleLine1: "Julumpia" } }] },
          ],
        }),
        blocks: new Map([["heygen-avatar-promo-card", BLOCK]]),
      }),
    );

    expect(file(compiled, "index.html")).toContain('data-composition-src="compositions/heygen-avatar-promo-card.html"');
    expect(file(compiled, "index.html")).toContain('data-composition-id="heygen-avatar-promo-card"');
    expect(compiled.files.map((entry) => entry.path)).toContain("compositions/heygen-avatar-promo-card.html");
    expect(compiled.binaries.map((entry) => entry.path)).toEqual(["assets/av_r1k1.mp4"]);
    expect(compiled.moduleVersions).toEqual({ ProductHero: "1.0.0" });
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
    ).toThrow(/both provide/);
  });

  it("is content-addressed: the same input hashes the same, a changed input does not", () => {
    const first = buildComposition(input());
    const second = buildComposition(input());
    expect(second.compositionHash).toBe(first.compositionHash);
    expect(first.compositionHash).toMatch(/^[0-9a-f]{64}$/);

    const changedText = spec();
    changedText.scenes[1]!.modules[0]!.content.text = "Julumpia Baru";
    expect(buildComposition(input({ spec: changedText })).compositionHash).not.toBe(first.compositionHash);

    const changedAsset = ASSETS.map((asset) => (asset.id === "asset-1" ? { ...asset, sha256: "d".repeat(64) } : asset));
    expect(buildComposition(input({ assets: changedAsset })).compositionHash).not.toBe(first.compositionHash);

    const changedResolution = buildComposition(input({ resolution: "720p" }));
    expect(changedResolution.compositionHash).not.toBe(first.compositionHash);
  });
});
