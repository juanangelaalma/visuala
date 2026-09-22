import { templateById } from "./templates/registry";
import { stylePackFor } from "./style-packs";
import type { RenderManifest } from "./render-manifest";

export type CompositionFile = { path: string; contents: string };
export type CompositionSource = { compositionId: string; files: readonly CompositionFile[] };

/** The composition id the runtime uses for `window.__timelines` and `data-composition-id`. */
export const COMPOSITION_ID = "main";

/**
 * A manifest becomes a self-contained composition: two text files and a relative reference to the
 * vendored animation runtime the composition writer copies in. Nothing here reads the filesystem or
 * the network, so the same manifest always produces the same bytes and the whole thing is unit-testable.
 *
 * The template is resolved from the manifest's frozen id and version rather than re-selected from the
 * video type, so a registry edit cannot change what an already-queued job renders.
 */
export function buildComposition(manifest: RenderManifest): CompositionSource {
  const template = templateById(manifest.templateId, manifest.templateVersion);
  const { html, css } = template.build({ manifest, stylePack: stylePackFor(manifest.styleId) });

  return {
    compositionId: COMPOSITION_ID,
    files: Object.freeze([
      Object.freeze({ path: "index.html", contents: html }),
      Object.freeze({ path: "styles.css", contents: css }),
    ]),
  };
}
