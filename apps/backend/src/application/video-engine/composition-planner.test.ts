import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../domain/ai-service/contracts";
import { COMPOSITION_SPEC_VERSION, compositionSpecFromWire, type CompositionSpecWire } from "../../domain/video-engine/composition";
import { buildCatalog } from "../../domain/video-engine/catalog";
import type { Catalog, CatalogItem } from "../../domain/video-engine/catalog";
import { PlanningError } from "../../domain/video-engine/errors";
import { recipeById } from "../../domain/video-engine/recipes/registry";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import { assertFallbackValid, runCompositionPlanner, type CompositionPlannerCommand } from "./composition-planner";
import type { CatalogCandidate } from "./candidate-selector";
import { COMPOSITION_PLANNER_PROMPT_VERSION } from "./prompts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

const brief: ValidationBrief = {
  productName: "Julumpia",
  brandName: "Julumpia",
  keyMessage: "Diskon 20% untuk semua menu",
  callToAction: "Pesan sekarang",
  orderDestination: null,
  audience: null,
  objective: null,
  productCategory: null,
  offer: { label: "Diskon 20%", detail: "Berlaku hari ini" },
  menuItems: null,
};

const artDirection: ArtDirection = {
  mainMessage: "Diskon 20%",
  visualFocus: "the product photo",
  hierarchy: ["headline", "offer"],
  mood: "bold",
  imageTreatment: "crop tight",
  motionDirection: "short rises",
  beats: [
    { id: "hook", intent: "open on the product", emphasis: "high" },
    { id: "message", intent: "state the key message", emphasis: "high" },
    { id: "proof", intent: "hold on the product", emphasis: "low" },
    { id: "cta", intent: "close on the call to action", emphasis: "medium" },
  ],
};

function catalogItem(name: string): CatalogItem {
  return { name, type: "block", title: name, description: "", tags: [], dimensions: { width: 1080, height: 1920 }, duration: 4 };
}

function catalog(names: string[]): Catalog {
  return buildCatalog(names.map(catalogItem), new Map());
}

function candidate(name: string): CatalogCandidate {
  return {
    name,
    type: "block",
    title: name,
    description: "",
    dimensions: { width: 1080, height: 1920 },
    duration: 4,
    variables: [],
    score: 5,
    beats: ["hook"],
  };
}

function wireModule(id: string, kind: "internal" | "catalog", content: Record<string, string> = {}) {
  return { id, kind, content: Object.entries(content).map(([key, value]) => ({ key, value })) };
}

/** Product hook, key message, product hold, then the closing action, at 30 fps. */
function plannedSpec(overrides: Partial<CompositionSpecWire> = {}): CompositionSpecWire {
  return {
    schemaVersion: COMPOSITION_SPEC_VERSION,
    format: { aspectRatio: "9:16", fps: 30, durationSeconds: 12 },
    style: { id: "creative-mode", version: "1" },
    scenes: [
      { id: "hook", durationFrames: 120, transition: "slide", motion: "product_push", modules: [wireModule("ProductHero", "internal", { assetId: ASSET_ID })] },
      { id: "message", durationFrames: 120, transition: "slide", motion: "staged_reveal", modules: [wireModule("Headline", "internal", { text: brief.keyMessage })] },
      { id: "proof", durationFrames: 60, transition: "slide", motion: "product_push", modules: [wireModule("ProductHero", "internal", { assetId: ASSET_ID })] },
      { id: "cta", durationFrames: 60, transition: "slide", motion: "staged_reveal", modules: [wireModule("CTA", "internal", { text: "Pesan sekarang" })] },
    ],
    ...overrides,
  };
}

function aiService(data: unknown): AIService {
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn(async () => ({
      requestId: "ai-request-1",
      profileId: "primary",
      provider: "9router",
      model: "cx/gpt-5.6-luna",
      providerRequestId: "provider-1",
      attemptCount: 1,
      finishReason: "stop" as const,
      usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
      estimatedCost: null,
      latencyMs: 2500,
      data,
    })),
  } as unknown as AIService;
}

async function command(overrides: Partial<CompositionPlannerCommand> = {}) {
  return {
    userId: USER_ID,
    projectId: PROJECT_ID,
    recipe: recipeById("product_promo"),
    brief,
    designPack: await createFsDesignPackSource(process.cwd()).load({ id: "creative-mode", version: "1" }),
    artDirection,
    candidates: [candidate("product-reveal")],
    assetIds: [ASSET_ID],
    language: "id",
    format: { aspectRatio: "9:16" as const, fps: 30, durationSeconds: 12 },
    ...overrides,
  };
}

describe("runCompositionPlanner", () => {
  it("returns a valid plan with its provenance", async () => {
    const ai = aiService(plannedSpec());

    const result = await runCompositionPlanner(await command(), { ai, createRequestId: () => "local-1", catalog: catalog([]) });

    expect(result.isFallback).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.spec).toEqual(compositionSpecFromWire(plannedSpec()));
    expect(result.generatedBy?.promptVersion).toBe(COMPOSITION_PLANNER_PROMPT_VERSION);
    expect(result.ai?.latencyMs).toBe(2500);

    const request = vi.mocked(ai.generateStructured).mock.calls[0][0];
    expect(request.task).toBe("composition_planner");
    expect(request.schema.name).toBe("composition_spec");
  });

  it("falls back when the plan names a catalog id that was never offered", async () => {
    const spec = plannedSpec({
      scenes: [
        { id: "hook", durationFrames: 120, transition: "slide", motion: "staged_reveal", modules: [wireModule("surprise-block", "catalog")] },
        ...plannedSpec().scenes.slice(1),
      ],
    });
    const known = { catalog: catalog(["surprise-block"]) };

    const result = await runCompositionPlanner(await command(), { ai: aiService(spec), createRequestId: () => "local-1", ...known });

    expect(result.isFallback).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("catalog_item_not_candidate");
    expect(result.generatedBy).toBeNull();
    expect(result.spec.scenes.flatMap((scene) => scene.modules).some((module) => module.kind === "catalog")).toBe(false);
  });

  it("falls back when the model invents a price the brief never stated", async () => {
    const spec = plannedSpec({
      scenes: [
        plannedSpec().scenes[0]!,
        { id: "message", durationFrames: 120, transition: "slide", motion: "staged_reveal", modules: [wireModule("Headline", "internal", { text: "Harga Rp9.999" })] },
        ...plannedSpec().scenes.slice(2),
      ],
    });

    const result = await runCompositionPlanner(await command(), { ai: aiService(spec), createRequestId: () => "local-1", catalog: catalog([]) });

    expect(result.isFallback).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("fact_untraceable");
  });

  it("uses internal modules only when no candidate matched, and still succeeds", async () => {
    const internalOnly = plannedSpec({
      scenes: [
        { ...plannedSpec().scenes[0]!, durationFrames: 90 },
        { ...plannedSpec().scenes[1]!, durationFrames: 90 },
        { ...plannedSpec().scenes[2]!, durationFrames: 90 },
        { ...plannedSpec().scenes[3]!, durationFrames: 90 },
      ],
    });
    const ai = aiService(internalOnly);

    const result = await runCompositionPlanner(await command({ candidates: [] }), { ai, createRequestId: () => "local-1", catalog: catalog([]) });

    expect(result.isFallback).toBe(false);
  });

  it("falls back on semantically repeated copy without another model request", async () => {
    const spec = plannedSpec();
    spec.scenes[0]!.modules.push(
      wireModule("Headline", "internal", { text: brief.productName }),
      wireModule("BrandMark", "internal", { text: brief.productName }),
    );
    const ai = aiService(spec);
    const complete = await command();
    const result = await runCompositionPlanner(complete, { ai, createRequestId: () => "local-1", catalog: catalog([]) });

    expect(result.isFallback).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("copy_repeated");
    expect(vi.mocked(ai.generateStructured)).toHaveBeenCalledTimes(1);
    expect(assertFallbackValid(result, complete, catalog([]))).toBe(result);
  });

  it("accepts a product, offer, then CTA discount story with executable scene direction", async () => {
    const spec = plannedSpec({
      scenes: [
        { id: "product_reveal", durationFrames: 120, transition: "cut", motion: "product_push", modules: [wireModule("ProductHero", "internal", { assetId: ASSET_ID })] },
        { id: "offer_reveal", durationFrames: 120, transition: "slide", motion: "staged_reveal", modules: [wireModule("OfferBadge", "internal", { text: brief.offer!.label })] },
        { id: "cta", durationFrames: 120, transition: "zoom", motion: "staged_reveal", modules: [wireModule("CTA", "internal", { text: brief.callToAction! })] },
      ],
    });
    const complete = await command({
      recipe: recipeById("discount_promo"),
      artDirection: { ...artDirection, beats: recipeById("discount_promo").beats.map((beat) => ({ ...beat, emphasis: "medium" as const })) },
    });
    const result = await runCompositionPlanner(complete, { ai: aiService(spec), createRequestId: () => "local-1", catalog: catalog([]) });

    expect(result.isFallback).toBe(false);
    expect(result.spec.scenes.map((scene) => [scene.id, scene.motion, scene.transition])).toEqual([
      ["product_reveal", "product_push", "cut"],
      ["offer_reveal", "staged_reveal", "slide"],
      ["cta", "staged_reveal", "zoom"],
    ]);
  });

  it("offers the fallback when the brief itself is unusable", async () => {
    const withoutOffer = { ...brief, offer: null };

    const result = await runCompositionPlanner(
      await command({ recipe: recipeById("discount_promo"), brief: withoutOffer }),
      { ai: aiService(plannedSpec()), createRequestId: () => "local-1", catalog: catalog([]) },
    );

    expect(result.isFallback).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("recipe_field_missing");
  });
});

describe("assertFallbackValid", () => {
  const unknownModule = plannedSpec({
    scenes: [
      { id: "hook", durationFrames: 120, transition: "slide", motion: "staged_reveal", modules: [wireModule("Nope", "internal")] },
      ...plannedSpec().scenes.slice(1),
    ],
  });

  it("passes a fallback that satisfies the gate and leaves a successful plan alone", async () => {
    const complete = await command();
    const plan = await runCompositionPlanner(complete, { ai: aiService(unknownModule), createRequestId: () => "local-1", catalog: catalog([]) });

    expect(plan.isFallback).toBe(true);
    expect(plan.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["internal_module_unknown", "beat_focus_invalid"]));

    const checked = assertFallbackValid(plan, complete, catalog([]));
    expect(checked).toBe(plan);
    expect(checked.isFallback).toBe(true);
  });

  it("refuses a fallback that cannot be valid, because the brief is missing a required field", async () => {
    const withoutOffer = { ...brief, offer: null };
    const unusable = await command({ recipe: recipeById("discount_promo"), brief: withoutOffer });
    const plan = await runCompositionPlanner(unusable, { ai: aiService(unknownModule), createRequestId: () => "local-1", catalog: catalog([]) });

    expect(plan.isFallback).toBe(true);
    expect(() => assertFallbackValid(plan, unusable, catalog([]))).toThrowError(PlanningError);
    expect(() => assertFallbackValid(plan, unusable, catalog([]))).toThrowError(/not valid/);
  });
});
