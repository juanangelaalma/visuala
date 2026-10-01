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

describe("buildComposition", () => {
  it("omits unreferenced assets from the frozen artifact", () => {
    const compiled = buildComposition(input());

    expect(compiled.assets.map((asset) => asset.path)).toEqual(["assets/asset-1.jpg"]);
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

  it("keeps exactly one internal scene active on every frame of fractional-second beats", () => {
    const durations = [113, 113, 112, 112];
    const fractionalSpec = spec({
      format: { aspectRatio: "9:16", fps: 30, durationSeconds: 15 },
      scenes: durations.map((durationFrames, index) => ({
        id: `scene_${index}`,
        durationFrames,
        modules: [{ id: "Headline", kind: "internal", content: { text: `Beat ${index}` } }],
      })),
    });
    const compiled = buildComposition(input({ spec: fractionalSpec }));
    const html = compiled.files.find((file) => file.path === "index.html")!.contents;
    const clips = [...html.matchAll(/<div\b[^>]*data-scene="([^"]+)"[^>]*>/g)].map(([tag, id]) => ({
      id,
      start: Number(tag!.match(/data-start="([^"]+)"/)![1]),
      duration: Number(tag!.match(/data-duration="([^"]+)"/)![1]),
    }));
    let expectedScene = 0;
    let endFrame = durations[0]!;
    for (let frame = 0; frame < 450; frame++) {
      if (frame === endFrame) endFrame += durations[++expectedScene]!;
      const time = frame / 30;
      const active = clips.filter((clip) => clip.start <= time && time < clip.start + clip.duration);
      expect(active.map((clip) => clip.id), `frame ${frame}`).toEqual([`scene_${expectedScene}`]);
    }
  });

  it("activates catalog hosts at the same fractional boundary as their internal scene", () => {
    const fractionalSpec = spec({
      format: { aspectRatio: "9:16", fps: 30, durationSeconds: 15 },
      scenes: [
        { id: "opening", durationFrames: 338, modules: [{ id: "Headline", kind: "internal", content: { text: "Opening" } }] },
        { id: "closing", durationFrames: 112, modules: [{ id: BLOCK.name, kind: "catalog", content: {} }] },
      ],
    });
    const compiled = buildComposition(input({ spec: fractionalSpec, blocks: new Map([[BLOCK.name, BLOCK]]) }));
    const html = compiled.files.find((file) => file.path === "index.html")!.contents;
    const tag = html.match(/<div\b[^>]*data-composition-src="[^"]+"[^>]*>/)![0];
    const start = Number(tag.match(/data-start="([^"]+)"/)![1]);
    const duration = Number(tag.match(/data-duration="([^"]+)"/)![1]);
    expect(start <= 337 / 30).toBe(false);
    expect(start <= 338 / 30 && 338 / 30 < start + duration).toBe(true);
    expect(start <= 449 / 30 && 449 / 30 < start + duration).toBe(true);
    expect(15 < start + duration).toBe(false);
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
