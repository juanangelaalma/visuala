import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DesignPackError, GROUND_TONES, designPackTokenSummary, localFontFaceCss, parseDesignPackManifest } from "./design-pack";

function committedManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), "design-packs/creative-mode/v1/manifest.json"), "utf8")) as Record<string, unknown>;
}

function withColor(value: unknown): Record<string, unknown> {
  const manifest = committedManifest();
  (manifest.colors as Record<string, unknown>).cream = value;
  return manifest;
}

describe("parseDesignPackManifest", () => {
  it("parses the committed creative-mode pack", () => {
    const pack = parseDesignPackManifest(committedManifest());

    expect(pack.styleId).toBe("creative-mode");
    expect(pack.version).toBe("1");
    expect(pack.colors.cream).toBe("#EFE9D9");
    expect(pack.typography.displayFamily).toBe("Archivo Black");
    expect(pack.typography.ramp["display-hero"].cqw).toBeGreaterThan(pack.typography.ramp["display-head"].cqw);
    expect(pack.fonts.map((font) => font.family)).toEqual(["Archivo Black", "Space Grotesk", "JetBrains Mono"]);
    expect(pack.aspectRatios).toContain("9:16");
  });

  it("rejects a missing version", () => {
    const manifest = committedManifest();
    delete manifest.version;

    expect(() => parseDesignPackManifest(manifest)).toThrow(DesignPackError);
  });

  it("rejects an unknown top-level key", () => {
    expect(() => parseDesignPackManifest({ ...committedManifest(), template: "x" })).toThrow(DesignPackError);
  });

  it("rejects a colour that is not a hex value", () => {
    expect(() => parseDesignPackManifest(withColor("cream"))).toThrow(DesignPackError);
  });

  it("rejects a font that is not a local fontsource package", () => {
    const manifest = committedManifest();
    (manifest.fonts as { package: string }[])[0].package = "https://fonts.googleapis.com/css?family=Archivo";

    expect(() => parseDesignPackManifest(manifest)).toThrow(/remote resource|not valid/);
  });

  it("rejects a remote reference hidden in a token", () => {
    const manifest = committedManifest();
    (manifest.typography as { displayFamily: string }).displayFamily = "http://example.com/Archivo";

    expect(() => parseDesignPackManifest(manifest)).toThrow(DesignPackError);
  });

  it("rejects a pack with no colours", () => {
    expect(() => parseDesignPackManifest({ ...committedManifest(), colors: {} })).toThrow(DesignPackError);
  });

  it("rejects a display family the pack does not ship", () => {
    const manifest = committedManifest();
    manifest.fonts = (manifest.fonts as { family: string }[]).filter((font) => font.family !== "Archivo Black");

    expect(() => parseDesignPackManifest(manifest)).toThrow(DesignPackError);
  });

  it("reports the machine-readable error code", () => {
    try {
      parseDesignPackManifest({});
      expect.unreachable("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DesignPackError);
      expect((error as DesignPackError).code).toBe("design_pack_invalid");
    }
  });
});

describe("localFontFaceCss", () => {
  it("declares each shipped face against a relative file", () => {
    const css = localFontFaceCss(parseDesignPackManifest(committedManifest()));

    expect(css).toContain('font-family: "Archivo Black"');
    expect(css).toContain('url("fonts/archivo-black-latin-400-normal.woff2") format("woff2")');
    expect(css).toContain('font-family: "Space Grotesk"');
    expect(css).toContain('font-family: "JetBrains Mono"');
    expect(css.match(/@font-face/g)).toHaveLength(3);
  });

  it("honours a custom base directory", () => {
    const css = localFontFaceCss(parseDesignPackManifest(committedManifest()), "assets/fonts");
    expect(css).toContain('url("assets/fonts/space-grotesk-latin-400-normal.woff2")');
  });
});

describe("designPackTokenSummary", () => {
  it("describes the pack in words, naming only tokens that exist", () => {
    const manifest = parseDesignPackManifest(committedManifest());
    const summary = designPackTokenSummary(manifest);

    expect(summary).toContain(`style: ${manifest.styleId}@${manifest.version}`);
    expect(summary).toContain(manifest.typography.displayFamily);
    for (const tone of GROUND_TONES) {
      expect(manifest.colors[tone], `the pack must define the ${tone} ground`).toBeDefined();
      expect(summary).toContain(tone);
    }
    for (const [name, value] of Object.entries(manifest.spacing)) expect(summary).toContain(`${name}=${value}`);
  });
});
