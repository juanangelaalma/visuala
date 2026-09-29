import { createRequire } from "node:module";
import { CompositionError } from "../../domain/video-engine/errors";
import type { CompiledFontRef } from "../../domain/video-engine/compiler";

const require = createRequire(import.meta.url);

/** Faces resolve from the installed package, never a URL: no render may reach the network for a font. */
export function resolveFontFile(font: Pick<CompiledFontRef, "package" | "file">): string {
  try {
    return require.resolve(`${font.package}/files/${font.file}`);
  } catch {
    throw new CompositionError("composition_font_missing", `The font package ${font.package} does not ship ${font.file}.`);
  }
}

/** The animation runtime the composition loads, pinned by the lockfile and copied in per artifact. */
export function gsapScriptPath(): string {
  return require.resolve("gsap/dist/gsap.min.js");
}
