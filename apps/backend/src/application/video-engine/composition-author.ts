import type { AIService } from "../../domain/ai-service/contracts";
import type { AIResultMetadata } from "../../domain/ai-service/types";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { CompiledBlock, CompileAsset } from "../../domain/video-engine/compiler";
import { sceneTimeline, type CompositionSpec } from "../../domain/video-engine/composition";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import { frameSizeFor } from "../../domain/video-engine/format";
import { COMPOSITION_AUTHOR_PROMPT_VERSION, compositionAuthorInstructions } from "./prompts";
import { processTrace } from "./process-trace";


export type CompositionCorrectionIssue = {
  code: string;
  message: string;
  scene?: string;
  selector?: string;
  time?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  sourceFile?: string;
};

export type CompositionCorrection = {
  previousHtml: string;
  issues: readonly CompositionCorrectionIssue[];
};

export type CompositionAuthorResult = { html: string; ai: AIResultMetadata };

export type CompositionAuthorInput = {
  userId: string;
  projectId: string;
  brief: ValidationBrief;
  artDirection: ArtDirection;
  spec: CompositionSpec;
  designPack: LoadedDesignPack;
  assets: readonly CompileAsset[];
  blocks: ReadonlyMap<string, CompiledBlock>;
  resolution: "720p" | "1080p";
  language: string;
  correction?: CompositionCorrection;
};

export class CompositionAuthorError extends Error {
  readonly code = "composition_html_invalid";
  constructor(
    message: string,
    readonly issueCode = "composition_html_invalid",
    readonly html?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "CompositionAuthorError";
  }
}

export async function runCompositionAuthor(input: CompositionAuthorInput, dependencies: {
  ai: AIService;
  createRequestId: () => string;
}): Promise<CompositionAuthorResult> {
  const result = await dependencies.ai.generateText({
    requestId: dependencies.createRequestId(),
    task: "composition_planner",
    context: { userId: input.userId, projectId: input.projectId },
    instructions: compositionAuthorInstructions({
      brief: input.brief,
      artDirection: input.artDirection,
      spec: input.spec,
      frameMd: input.designPack.frameMd,
      designMd: input.designPack.designMd,
      manifest: input.designPack.manifest,
      assets: input.assets,
      blocks: [...input.blocks.values()],
      ...frameSizeFor(input.spec.format.aspectRatio, input.resolution),
      language: input.language,
    }),
    messages: [{
      role: "user",
      content: input.correction ? [
        "Correct this rejected composition. Return the complete replacement index.html, not a patch.",
        "Preserve the approved storyboard, timing, frame, content zones, and local resource restrictions in the instructions.",
        ...correctionGuidance(input.correction.issues),
        "Previous HTML:",
        input.correction.previousHtml,
        "Validation findings with exact locations:",
        JSON.stringify(input.correction.issues),
      ].join("\n") : "Write the entire index.html for this video.",
    }],
    promptVersion: COMPOSITION_AUTHOR_PROMPT_VERSION,
  });
  processTrace({
    projectId: input.projectId,
    requestId: result.requestId,
    sourceFile: "apps/backend/src/application/video-engine/composition-author.ts",
  }).response("composition_html", result.text);
  try {
    assertCompositionHtml(result.text, input.spec, frameSizeFor(input.spec.format.aspectRatio, input.resolution));
  } catch (error) {
    if (!(error instanceof CompositionAuthorError)) throw error;
    throw new CompositionAuthorError(error.message, error.issueCode, result.text, result.requestId);
  }
  const { text, ...ai } = result;
  return { html: text, ai };
}

function correctionGuidance(issues: readonly CompositionCorrectionIssue[]): string[] {
  const codes = new Set(issues.map((issue) => issue.code));
  const guidance: string[] = [];
  if (codes.has("gsap_animates_clip_element")) {
    guidance.push("HyperFrames rejected animation of a scene clip. Keep .clip and .hf-scene static; move all GSAP targets to .hf-scene__content or .hf-module descendants.");
  }
  if (codes.has("gsap_fullscreen_overlay_starts_visible")) {
    guidance.push("HyperFrames found a full-frame overlay visible in the initial state. Define seek-safe hidden initial states for timed overlays and reveal them only at their absolute timeline positions.");
  }
  if (codes.has("blank_boundary")) {
    guidance.push("A scene boundary was captured with no visible foreground text or image. Make real foreground visible at the incoming scene start and at least one frame after it; keep outgoing foreground visible until incoming foreground is visible. Do not hide the outgoing scene at the same instant an incoming entrance animation starts. Backgrounds and aria-hidden decoration do not satisfy this check.");
  }
  if (codes.has("text_overflow") || codes.has("text_out_of_frame") || codes.has("text_clipped")) {
    guidance.push("A text bounding box exceeds its module or canvas, or is clipped. Use the supplied selector and bbox to identify the exact line; reduce its font size, wrap it, or enlarge/reposition its module until the full rendered text fits with a safe margin.");
  }
  if (codes.has("text_overlap") || codes.has("image_text_overlap") || codes.has("content_overlap")) {
    guidance.push("Readable content overlaps another text or protected product/content zone. Reposition or resize the affected module; do not cover the product zone with its label.");
  }
  if (codes.has("contrast_aa_failure")) {
    guidance.push("A text color failed the contrast check. Change foreground/background colors to meet WCAG AA while preserving the approved design direction.");
  }
  return guidance;
}


export function assertCompositionHtml(html: string, spec: CompositionSpec, frame = frameSizeFor(spec.format.aspectRatio, "1080p")): void {
  const document = html.trim();
  if (!/^<!doctype html\s*>/i.test(document) || !/<\/html\s*>$/i.test(document)) {
    throw new CompositionAuthorError("AI must return a complete index.html document without Markdown or surrounding text.", "html_document_invalid");
  }
  const tags = [...document.matchAll(/<[a-z][^>]*>/gi)].map((match) => match[0]);
  const roots = tags.filter((tag) => attribute(tag, "data-composition-id") === "main");
  const root = roots[0];
  if (roots.length !== 1 || !root ||
      Number(attribute(root, "data-fps")) !== spec.format.fps ||
      Number(attribute(root, "data-duration")) !== spec.format.durationSeconds ||
      Number(attribute(root, "data-width")) !== frame.width ||
      Number(attribute(root, "data-height")) !== frame.height ||
      !/window\.__timelines\s*(?:\.\s*main\b|\[\s*["']main["']\s*\])\s*=(?!=)/.test(document) ||
      !tags.some((tag) => /^<script\b/i.test(tag) && attribute(tag, "src") === "vendor/gsap.min.js")) {
    throw new CompositionAuthorError("AI HTML is missing the HyperFrames root, matching format, paused timeline registration, or local GSAP script.", "html_root_invalid");
  }
  const scenes = tags.filter((tag) => attribute(tag, "class")?.split(/\s+/).includes("hf-scene"));
  const timeline = sceneTimeline(spec);
  if (scenes.length !== timeline.length || scenes.some((tag, index) =>
    !attribute(tag, "class")?.split(/\s+/).includes("clip") ||
    attribute(tag, "data-track-index") !== "0" ||
    attribute(tag, "data-scene") !== timeline[index]?.id ||
    !matchesFrame(attribute(tag, "data-start"), timeline[index]!.startFrames, spec.format.fps) ||
    !matchesFrame(attribute(tag, "data-duration"), timeline[index]!.durationFrames, spec.format.fps))) {
    throw new CompositionAuthorError("AI HTML must contain every storyboard scene with its approved timing and order.", "html_scenes_invalid");
  }
  const remoteResource = tags.some((tag) =>
    /^(?:<script|<img|<link|<video|<source|<iframe)\b/i.test(tag) &&
    ["src", "href"].some((name) => /^(?:https?:)?\/\/|^(?:data|javascript):/i.test(attribute(tag, name) ?? "")));
  if (remoteResource || /@import\b|url\(\s*["']?(?:https?:)?\/\//i.test(document)) {
    throw new CompositionAuthorError("AI HTML must only use local, approved composition resources.", "html_resource_external");
  }
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
}

function matchesFrame(seconds: string | undefined, frames: number, fps: number): boolean {
  const value = Number(seconds);
  return seconds !== undefined && Number.isFinite(value) && Math.abs(value * fps - frames) < 0.05;
}
