import { z } from "zod";

export const DESIGN_PACK_SCHEMA_VERSION = "design-pack@v1";

/** The colour keys a background may name. Kept here because the pack, the prompt, and the modules must agree. */
export const GROUND_TONES = ["cream", "cream2", "pink", "green", "orange", "ink"] as const;

export type GroundTone = (typeof GROUND_TONES)[number];

export type DesignPackErrorCode =
  | "design_pack_invalid"
  | "design_pack_missing"
  | "design_pack_font_not_local";

export class DesignPackError extends Error {
  constructor(readonly code: DesignPackErrorCode, message: string) {
    super(message);
    this.name = "DesignPackError";
  }
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected a 6-digit hex colour");
const cqw = z.number().positive().max(100);

/** Only bundled `@fontsource` faces are legal: a pack naming a webfont URL would make every render reach the network. */
const designPackFontSchema = z
  .object({
    family: z.string().trim().min(1),
    package: z.string().trim().regex(/^@fontsource\/[a-z0-9-]+$/),
    weight: z.number().int().min(100).max(900),
    file: z.string().trim().regex(/^[a-z0-9-]+\.woff2$/),
  })
  .strict();

const designPackTextStyleSchema = z
  .object({
    family: z.enum(["display", "mono", "body"]),
    cqw,
    weight: z.number().int().min(100).max(900),
    lineHeight: z.number().positive().max(3),
    tracking: z.number().min(-0.2).max(0.5).optional(),
    uppercase: z.boolean(),
  })
  .strict();

export const designPackManifestSchema = z
  .object({
    styleId: z.string().trim().regex(/^[a-z0-9-]+$/),
    version: z.string().trim().regex(/^\d+$/),
    aspectRatios: z.array(z.enum(["9:16", "1:1", "16:9"])).min(1),
    colors: z.record(z.string(), hexColor),
    typography: z
      .object({
        displayFamily: z.string().trim().min(1),
        monoFamily: z.string().trim().min(1),
        bodyFamily: z.string().trim().min(1),
        ramp: z.record(z.string(), designPackTextStyleSchema),
      })
      .strict(),
    spacing: z.record(z.string(), z.string().trim().regex(/^-?\d+(\.\d+)?(cqw|cqh|px|%)$/)),
    motion: z
      .object({
        energy: z.enum(["calm", "brisk", "bold"]),
        enterSeconds: z.number().positive(),
        exitSeconds: z.number().nonnegative(),
        staggerSeconds: z.number().nonnegative(),
      })
      .strict(),
    fonts: z.array(designPackFontSchema).min(1),
    rules: z
      .object({
        maxAccentsPerFrame: z.number().int().min(1).max(6),
        minLoadBearingCqw: z.number().positive().max(10),
        headlineMaxWidthCqw: z.number().positive().max(100),
        borderCqw: z.number().positive().max(2),
        ruleCqw: z.number().positive().max(2),
        hardShadow: z.string().trim().min(1),
        radius: z.record(z.string(), z.string().trim().min(1)),
        rotation: z.record(z.string(), z.number().min(-45).max(45)),
      })
      .strict(),
  })
  .strict();

export type DesignPackManifest = z.infer<typeof designPackManifestSchema>;
export type DesignPackFont = z.infer<typeof designPackFontSchema>;
export type DesignPackTextStyle = z.infer<typeof designPackTextStyleSchema>;

/** The styleId/version pair a composition references; the pack itself is resolved from it. */
export type DesignPackRef = { id: string; version: string };

/** The pack this engine ships with. A project stores the id; the version stays pinned until a pack is chosen per project. */
export const BUILT_IN_DESIGN_PACK: DesignPackRef = { id: "creative-mode", version: "1" };

/** Validates a pack and applies the cross-field rules a plain schema cannot express. */
export function parseDesignPackManifest(value: unknown): DesignPackManifest {
  const parsed = designPackManifestSchema.safeParse(value);
  if (!parsed.success) throw new DesignPackError("design_pack_invalid", "The Design Pack manifest is not valid.");
  const manifest = parsed.data;

  if (Object.keys(manifest.colors).length === 0) {
    throw new DesignPackError("design_pack_invalid", "The Design Pack defines no colours.");
  }
  if (containsRemoteReference(manifest)) {
    throw new DesignPackError("design_pack_font_not_local", "The Design Pack references a remote resource.");
  }
  for (const family of [manifest.typography.displayFamily, manifest.typography.monoFamily, manifest.typography.bodyFamily]) {
    if (!manifest.fonts.some((font) => font.family === family)) {
      throw new DesignPackError("design_pack_font_not_local", `The Design Pack ships no face for ${family}.`);
    }
  }
  return manifest;
}

function containsRemoteReference(manifest: DesignPackManifest): boolean {
  return JSON.stringify(manifest).includes("http");
}

/** The face declarations the artifact embeds; the files are copied in beside the composition. */
export function localFontFaceCss(manifest: DesignPackManifest, baseDir = "fonts"): string {
  return manifest.fonts
    .map(
      (font) => `@font-face {
  font-family: "${font.family}";
  font-style: normal;
  font-weight: ${font.weight};
  font-display: block;
  src: url("${baseDir}/${font.file}") format("woff2");
}`,
    )
    .join("\n");
}

/** The pack in words for a prompt: the planner may only use these tokens through a module slot. */
export function designPackTokenSummary(manifest: DesignPackManifest): string {
  return [
    `style: ${manifest.styleId}@${manifest.version} (${manifest.motion.energy} motion, enter ${manifest.motion.enterSeconds}s, stagger ${manifest.motion.staggerSeconds}s)`,
    `ground tones: ${GROUND_TONES.join(", ")}`,
    `colours: ${Object.entries(manifest.colors).map(([name, value]) => `${name}=${value}`).join(", ")}`,
    `type: display ${manifest.typography.displayFamily}, mono ${manifest.typography.monoFamily}, body ${manifest.typography.bodyFamily}`,
    `type ramp (cqw of frame width): ${Object.entries(manifest.typography.ramp)
      .map(([name, style]) => `${name}=${style.cqw}${style.uppercase ? " upper" : ""}`)
      .join(", ")}`,
    `spacing: ${Object.entries(manifest.spacing).map(([name, value]) => `${name}=${value}`).join(", ")}`,
    `rules: at most ${manifest.rules.maxAccentsPerFrame} accents per frame, headline max ${manifest.rules.headlineMaxWidthCqw}cqw wide`,
  ].join("\n");
}
