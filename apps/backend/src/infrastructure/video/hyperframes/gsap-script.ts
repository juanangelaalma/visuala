import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The animation runtime the composition loads, pinned by the lockfile and copied in per render.
 * `createRequire` resolves it the way the rest of the backend resolves packages; `import.meta.resolve`
 * is not available under this project's Vitest configuration, so a test could not load it.
 */
export function gsapScriptPath(): string {
  return require.resolve("gsap/dist/gsap.min.js");
}
