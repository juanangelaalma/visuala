import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { z } from "zod";

const componentSchema = z.object({
  file: z.string(), selector: z.string(), variants: z.array(z.string()),
  compatibleMotions: z.array(z.string()), animationTargets: z.array(z.string()),
});

const librarySchema = z.object({
  version: z.string(), styles: z.array(z.string()), motionRegistry: z.string(),
  frame: z.object({ width: z.literal(1080), height: z.literal(1920) }),
  components: z.record(z.string(), componentSchema),
});

const motionRegistrySchema = z.object({
  motions: z.record(z.string(), z.object({ file: z.string(), compatibleTargets: z.array(z.string()) })),
});

const poseSchema = z.object({
  at: z.number().nonnegative(), x: z.number(), y: z.number(), scale: z.number().positive(),
  rotation: z.number(), opacity: z.number().min(0).max(1), easing: z.string().optional(),
});

const motionSchema = z.object({
  id: z.string(), duration: z.number().positive(), targets: z.array(z.string()),
  behavior: z.object({ iterations: z.literal(1), transformOrigin: z.string().optional(), keyframes: z.array(poseSchema).min(2) }),
});

export type MotionPose = z.infer<typeof poseSchema>;

export type MotionDefinition = z.infer<typeof motionSchema>;

export type ComponentName = "BrandBackground" | "BigStatement" | "FlavorCallout" | "ProductHero" | "DiscountBadge" | "OldNewPrice" | "OrderNowCTA" | "PromoEndCard";

export type MotionName = "typography.kinetic-up" | "product.slide-up" | "promo.badge-pop" | "product.float-in";

const COMPONENTS: ComponentName[] = ["BrandBackground", "BigStatement", "FlavorCallout", "ProductHero", "DiscountBadge", "OldNewPrice", "OrderNowCTA", "PromoEndCard"];

const MOTIONS: MotionName[] = ["typography.kinetic-up", "product.slide-up", "promo.badge-pop", "product.float-in"];

const libraryRoot = new URL("../../../fnb-library/", import.meta.url);

async function readLibraryFile(path: string): Promise<string> {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split("/").includes("..") || path.startsWith("/")) {
    throw new Error(`Unsafe F&B library path: ${path}`);
  }

  return readFile(new URL(path, libraryRoot), "utf8");
}

async function loadLibrary(): Promise<CompositionLibrary> {
  const registry = librarySchema.parse(JSON.parse(await readLibraryFile("registry.json")));
  const motionRegistry = motionRegistrySchema.parse(JSON.parse(await readLibraryFile(registry.motionRegistry)));
  const fragments: Partial<Record<ComponentName, string>> = {};
  const motions: Partial<Record<MotionName, MotionDefinition>> = {};
  await Promise.all(COMPONENTS.map(async (name) => {
    const component = registry.components[name];

    if (!component) throw new Error(`Missing registered component ${name}`);
    fragments[name] = await readLibraryFile(component.file);
  }));
  await Promise.all(MOTIONS.map(async (name) => {
    const entry = motionRegistry.motions[name];

    if (!entry) throw new Error(`Missing registered motion ${name}`);
    const motion = motionSchema.parse(JSON.parse(await readLibraryFile(`motions/${entry.file}`)));
    const keyframes = motion.behavior.keyframes;

    if (motion.id !== name || keyframes[0]!.at !== 0 || keyframes.at(-1)!.at !== motion.duration
      || keyframes.some((pose, index) => index > 0 && pose.at <= keyframes[index - 1]!.at)) {
      throw new Error(`Invalid registered motion timing ${name}`);
    }

    motions[name] = motion;
  }));

  const fontFiles = [
    { file: "DejaVuSans.woff2", family: "FnbSans", weight: 400 },
    { file: "DejaVuSans-Bold.woff2", family: "FnbSans", weight: 700 },
    { file: "DejaVuSerif.woff2", family: "FnbSerif", weight: 400 },
    { file: "DejaVuSerif-Bold.woff2", family: "FnbSerif", weight: 700 },
  ];

  const fontCss = (await Promise.all(fontFiles.map(async (font) => {
    const bytes = await readFile(new URL(`../../../fnb-fonts/${font.file}`, import.meta.url));

    return `@font-face{font-family:${font.family};font-style:normal;font-weight:${font.weight};font-display:block;src:url("data:font/woff2;base64,${bytes.toString("base64")}") format("woff2")}`;
  }))).join("\n");

  const libraryCss = (await Promise.all(registry.styles.map(readLibraryFile))).join("\n")
    .replace("--font-display:Georgia,serif;", "--font-display:FnbSerif,serif;")
    .replace("--font-body:Arial,sans-serif;", "--font-body:FnbSans,sans-serif;");

  const css = `${fontCss}\n${libraryCss}`;
  const gsap = await readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"), "utf8");

  return { registry, motionRegistry, fragments, motions, css, gsap: gsap.replace(/\/\/# sourceMappingURL=.*$/gm, "") };
}

export interface CompositionLibrary {
  registry: z.infer<typeof librarySchema>;
  motionRegistry: z.infer<typeof motionRegistrySchema>;
  fragments: Partial<Record<ComponentName, string>>;
  motions: Partial<Record<MotionName, MotionDefinition>>;
  css: string;
  gsap: string;
}

let libraryPromise: Promise<CompositionLibrary> | undefined;

export async function getCompositionLibrary(): Promise<CompositionLibrary> {
  if (!libraryPromise) {
    const pending = loadLibrary();
    libraryPromise = pending;
    void pending.catch(() => {
      if (libraryPromise === pending) libraryPromise = undefined;
    });
  }

  return libraryPromise;
}
