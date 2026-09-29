import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../domain/video-engine/hash";
import { writeComposition } from "./composition-writer";
import type { CompiledComposition } from "../../domain/video-engine/compiler";

function compiled(overrides: Partial<CompiledComposition> = {}): CompiledComposition {
  return {
    compositionId: "main",
    files: [{ path: "index.html", contents: "<html></html>" }, { path: "styles.css", contents: "body{}" }],
    binaries: [],
    assets: [],
    fonts: [],
    moduleVersions: {},
    compositionHash: "0".repeat(64),
    ...overrides,
  };
}

function workspace(): { dir: string; gsapScriptPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "composition-writer-"));
  const gsapScriptPath = join(dir, "gsap.min.js");
  writeFileSync(gsapScriptPath, "/* gsap */");
  return { dir, gsapScriptPath };
}

describe("writeComposition", () => {
  it("writes text files and copies the animation runtime", async () => {
    const { dir, gsapScriptPath } = workspace();
    const target = join(dir, "artifact");

    await writeComposition(compiled(), target, { objectStore: fakeStore({}), gsapScriptPath, resolveFontFile: () => "" });

    expect(readFileSync(join(target, "index.html"), "utf8")).toBe("<html></html>");
    expect(readFileSync(join(target, "vendor", "gsap.min.js"), "utf8")).toBe("/* gsap */");
  });

  it("copies block binaries and refuses one that changed", async () => {
    const { dir, gsapScriptPath } = workspace();
    const source = join(dir, "block.mp4");
    writeFileSync(source, new Uint8Array([9, 9, 9]));
    const binary = { path: "assets/block.mp4", sha256: sha256Hex(new Uint8Array([9, 9, 9])), sourcePath: source };

    const target = join(dir, "artifact");
    await writeComposition(compiled({ binaries: [binary] }), target, { objectStore: fakeStore({}), gsapScriptPath, resolveFontFile: () => "" });
    expect(readFileSync(join(target, "assets", "block.mp4"))).toEqual(Buffer.from([9, 9, 9]));

    const changed = { ...binary, sha256: "1".repeat(64) };
    await expect(
      writeComposition(compiled({ binaries: [changed] }), join(dir, "artifact-2"), { objectStore: fakeStore({}), gsapScriptPath, resolveFontFile: () => "" }),
    ).rejects.toMatchObject({ code: "composition_block_mutated" });
  });

  it("verifies an asset against its frozen hash", async () => {
    const { dir, gsapScriptPath } = workspace();
    const bytes = new TextEncoder().encode("image-bytes");
    const asset = { path: "assets/asset-1.jpg", objectKey: "k", sha256: sha256Hex(bytes) };

    await writeComposition(compiled({ assets: [asset] }), join(dir, "artifact"), {
      objectStore: fakeStore({ k: bytes }),
      gsapScriptPath,
      resolveFontFile: () => "",
    });
    expect(readFileSync(join(dir, "artifact", "assets", "asset-1.jpg"))).toEqual(Buffer.from(bytes));

    await expect(
      writeComposition(compiled({ assets: [{ ...asset, sha256: "2".repeat(64) }] }), join(dir, "artifact-2"), {
        objectStore: fakeStore({ k: bytes }),
        gsapScriptPath,
        resolveFontFile: () => "",
      }),
    ).rejects.toMatchObject({ code: "composition_asset_mutated" });
  });

  it("reports a missing asset and a missing font", async () => {
    const { dir, gsapScriptPath } = workspace();
    const asset = { path: "assets/asset-1.jpg", objectKey: "missing", sha256: "3".repeat(64) };

    await expect(
      writeComposition(compiled({ assets: [asset] }), join(dir, "artifact"), { objectStore: fakeStore({}), gsapScriptPath, resolveFontFile: () => "" }),
    ).rejects.toMatchObject({ code: "composition_asset_missing" });

    await expect(
      writeComposition(compiled({ fonts: [{ path: "fonts/x.woff2", package: "@fontsource/x", file: "x.woff2" }] }), join(dir, "artifact-3"), {
        objectStore: fakeStore({}),
        gsapScriptPath,
        resolveFontFile: () => join(dir, "nope.woff2"),
      }),
    ).rejects.toMatchObject({ code: "composition_font_missing" });
  });

  it("copies a font file into the artifact", async () => {
    const { dir, gsapScriptPath } = workspace();
    const fontPath = join(dir, "archivo.woff2");
    writeFileSync(fontPath, "font-bytes");

    await writeComposition(compiled({ fonts: [{ path: "fonts/archivo.woff2", package: "@fontsource/archivo-black", file: "archivo.woff2" }] }), join(dir, "artifact"), {
      objectStore: fakeStore({}),
      gsapScriptPath,
      resolveFontFile: () => fontPath,
    });

    expect(readFileSync(join(dir, "artifact", "fonts", "archivo.woff2"), "utf8")).toBe("font-bytes");
  });
});

function fakeStore(objects: Record<string, Uint8Array>) {
  return {
    async read(key: string): Promise<Uint8Array> {
      const value = objects[key];
      if (!value) throw new Error("not found");
      return value;
    },
  };
}
