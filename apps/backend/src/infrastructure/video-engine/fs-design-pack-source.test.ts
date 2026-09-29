import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesignPackError } from "../../domain/video-engine/design-pack";
import { createFsDesignPackSource, designPackDirectory } from "./fs-design-pack-source";

const root = process.cwd();

describe("createFsDesignPackSource", () => {
  const source = createFsDesignPackSource(root);

  it("loads the built-in creative-mode pack", async () => {
    const pack = await source.load({ id: "creative-mode", version: "1" });

    expect(pack.manifest.styleId).toBe("creative-mode");
    expect(pack.frameMd).toContain("Creative Mode");
    expect(pack.frameMd.length).toBeGreaterThan(500);
  });

  it("reports a missing pack with the design_pack_missing code", async () => {
    await expect(source.load({ id: "no-such-style", version: "1" })).rejects.toMatchObject({
      code: "design_pack_missing",
    });
  });

  it("rejects a pack whose frame.md is empty", async () => {
    const tempRoot = makeTempRoot();
    const dir = designPackDirectory(tempRoot, { id: "empty", version: "1" });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(minimalManifest()));
    writeFileSync(join(dir, "frame.md"), "   \n");

    expect(dir.endsWith(join("design-packs", "empty", "v1"))).toBe(true);
    await expect(createFsDesignPackSource(tempRoot).load({ id: "empty", version: "1" })).rejects.toBeInstanceOf(DesignPackError);
  });

  it("rejects a manifest that is not JSON", async () => {
    const tempRoot = makeTempRoot();
    const dir = designPackDirectory(tempRoot, { id: "broken", version: "1" });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), "{ not json");
    writeFileSync(join(dir, "frame.md"), "frame");

    await expect(createFsDesignPackSource(tempRoot).load({ id: "broken", version: "1" })).rejects.toMatchObject({
      code: "design_pack_missing",
    });
  });
});

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "design-pack-"));
}

function minimalManifest(): Record<string, unknown> {
  return {
    styleId: "empty",
    version: "1",
    aspectRatios: ["9:16"],
    colors: { ink: "#000000" },
    typography: {
      displayFamily: "Archivo Black",
      monoFamily: "JetBrains Mono",
      bodyFamily: "Space Grotesk",
      ramp: { body: { family: "body", cqw: 1.2, weight: 400, lineHeight: 1.3, uppercase: false } },
    },
    spacing: { pad: "3cqw" },
    motion: { energy: "bold", enterSeconds: 0.5, exitSeconds: 0.3, staggerSeconds: 0.1 },
    fonts: [{ family: "Archivo Black", package: "@fontsource/archivo-black", weight: 400, file: "archivo-black-latin-400-normal.woff2" }],
    rules: {
      maxAccentsPerFrame: 3,
      minLoadBearingCqw: 1.4,
      headlineMaxWidthCqw: 78,
      borderCqw: 0.4,
      ruleCqw: 0.3,
      hardShadow: "1.25cqw 1.25cqw 0",
      radius: { structural: "0" },
      rotation: { badge: -4 },
    },
  };
}
