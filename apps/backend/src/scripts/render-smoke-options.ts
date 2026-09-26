import { z } from "zod";
import { VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS_SECONDS, VIDEO_RESOLUTIONS, VIDEO_STYLE_IDS } from "@/domain/video/settings";
import { RENDER_TEMPLATES, type RenderTemplate } from "@/domain/video/templates/registry";
import type { StoryboardScene } from "@/domain/video/storyboard";
import type { VideoDurationSeconds } from "@/domain/video/types";

const CONTENT_FIXTURES = ["standard", "long", "menu", "short"] as const;
const TEMPLATE_IDS = RENDER_TEMPLATES.map(({ id }) => id) as [string, ...string[]];
const smokeOptionsSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS),
  styleId: z.enum(VIDEO_STYLE_IDS),
  content: z.enum(CONTENT_FIXTURES),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  durationSeconds: z.coerce.number().pipe(z.union(VIDEO_DURATIONS_SECONDS.map((duration) => z.literal(duration)))),
  keep: z.boolean(),
}).strict();

export type SmokeOptions = z.infer<typeof smokeOptionsSchema> & { template: RenderTemplate };
type SmokeContent = {
  scenes: StoryboardScene[];
  brief: {
    productName: string;
    brandName: string | null;
    keyMessage: string;
    callToAction: string | null;
    orderDestination: string | null;
    menuItems: { name: string; price: string | null }[] | null;
  };
};

export function parseSmokeOptions(args: readonly string[]): SmokeOptions {
  const flags = parseFlags(args);
  const parsed = smokeOptionsSchema.parse({
    templateId: flags.template ?? "product-spotlight",
    styleId: flags.style ?? "bold_pop",
    content: flags.content ?? "standard",
    aspectRatio: flags["aspect-ratio"] ?? "9:16",
    resolution: flags.resolution ?? "720p",
    durationSeconds: flags.duration ?? "6",
    keep: flags.keep === true,
  });
  const template = RENDER_TEMPLATES.find((entry) => entry.id === parsed.templateId);
  if (!template || !template.aspectRatios.includes(parsed.aspectRatio)) {
    throw new Error("Unsupported smoke template or aspect ratio.");
  }
  if (!template.supports[0]) throw new Error("Smoke template has no supported video type.");
  return { ...parsed, template };
}

export function buildSmokeContent(content: SmokeOptions["content"], durationSeconds: VideoDurationSeconds): SmokeContent {
  const boundary = content === "short" ? 0.5 : durationSeconds / 2;
  const title = content === "long" ? "A".repeat(40) : content === "short" ? "Fresh" : "Smoke";
  const copies = content === "long" ? ["B".repeat(90), "B".repeat(90)] : content === "short" ? ["Now", "Order today"] : ["Scene one", "Scene two"];
  return {
    scenes: [scene(1, 0, boundary, title, copies[0]), scene(2, boundary, durationSeconds, title, copies[1])],
    brief: {
      productName: "Smoke",
      brandName: null,
      keyMessage: "Smoke",
      callToAction: content === "long" ? "C".repeat(80) : null,
      orderDestination: null,
      menuItems: content === "menu" ? [
        { name: "Kopi Susu", price: "Rp25.000" },
        { name: "Teh Melati", price: "Rp15.000" },
        { name: "Roti Bakar", price: "Rp20.000" },
      ] : null,
    },
  };
}

export async function runValidatedSmoke(
  args: readonly string[],
  execute: (options: SmokeOptions) => void | Promise<void>,
): Promise<void> {
  await execute(parseSmokeOptions(args));
}

const VALUE_FLAGS = ["template", "style", "content", "aspect-ratio", "resolution", "duration"] as const;
type ParsedFlags = Partial<Record<(typeof VALUE_FLAGS)[number], string>> & { keep?: true };

function parseFlags(args: readonly string[]): ParsedFlags {
  const parsed: ParsedFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--keep" && parsed.keep === undefined) {
      parsed.keep = true;
      continue;
    }
    const name = token?.startsWith("--") ? token.slice(2) : "";
    if (!VALUE_FLAGS.includes(name as (typeof VALUE_FLAGS)[number]) || name in parsed) throw invalidArguments();
    const value = args[++index];
    if (!value || value.startsWith("--")) throw invalidArguments();
    parsed[name as (typeof VALUE_FLAGS)[number]] = value;
  }
  return parsed;
}

function invalidArguments(): Error {
  return new Error("Invalid smoke command arguments.");
}

function scene(order: number, startSeconds: number, endSeconds: number, onScreenTitle: string, onScreenCopy: string): StoryboardScene {
  return { order, startSeconds, endSeconds, visual: "smoke", onScreenTitle, onScreenCopy, voiceOver: null, caption: null, assetIds: ["00000000-0000-4000-8000-000000000006"], audioCue: null, transition: "fade" };
}
