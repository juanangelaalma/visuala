import { describe, expect, it, vi } from "vitest";
import type { ComposeDependencies } from "./compose";
import { runComposition } from "./compose";
import { buildCatalog } from "../../domain/video-engine/catalog";
import { COMPOSITION_SPEC_VERSION } from "../../domain/video-engine/composition";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function dependencies(): ComposeDependencies {
  return {
    projects: {
      getOwned: vi.fn(async () => ({
        id: PROJECT_ID,
        userId: USER_ID,
        title: "Promo roti",
        videoType: "discount_promo",
        styleId: "creative-mode",
        status: "awaiting_approval",
        settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
        revisionRenderCount: 0,
        createdAt: "2026-09-30T00:00:00.000Z",
        updatedAt: "2026-09-30T00:00:00.000Z",
      })),
    },
    briefRevisions: {
      latestOwned: vi.fn(async () => ({
        id: "44444444-4444-4444-8444-444444444444",
        projectId: PROJECT_ID,
        userId: USER_ID,
        version: 1,
        schemaVersion: "v1",
        isComplete: true,
        brief: {
          productName: "Roti Abon",
          productCategory: null,
          audience: "Umum",
          objective: "Naikkan penjualan",
          keyMessage: "Roti abon yang enak",
          offer: { label: "Promo", detail: "Diskon 10%" },
          callToAction: null,
          orderDestination: null,
          brandName: null,
          styleId: "creative-mode",
          outputSettings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
          menuItems: null,
          facts: [
            { field: "offer.label", value: "Promo", source: "user_message" },
            { field: "offer.detail", value: "Diskon 10%", source: "user_message" },
          ],
        },
        generatedBy: { profileId: "primary", provider: "test", model: "test", promptVersion: "test", requestId: "request-1" },
        sourceMessageIds: [],
        createdAt: "2026-09-30T00:00:00.000Z",
      })),
    },
    ai: { generateStructured: vi.fn(), generateText: vi.fn() },
  } as unknown as ComposeDependencies;
}

function completeDependencies(): ComposeDependencies {
  const pendingAsset = {
    id: "55555555-5555-4555-8555-555555555555",
    projectId: PROJECT_ID,
    userId: USER_ID,
    objectKey: `video-projects/${PROJECT_ID}/pending.jpg`,
    mimeType: "image/jpeg" as const,
    byteSize: 100,
    sha256: "a".repeat(64),
    width: 184,
    height: 184,
    rightsConfirmedAt: "2026-09-30T00:00:00.000Z",
    moderationStatus: "pending" as const,
    createdAt: "2026-09-30T00:00:00.000Z",
  };
  const blockedAsset = { ...pendingAsset, id: "66666666-6666-4666-8666-666666666666", moderationStatus: "blocked" as const };
  const aiResult = (data: unknown) => ({
    requestId: "provider-request",
    profileId: "primary",
    provider: "test",
    model: "test",
    providerRequestId: "provider-1",
    attemptCount: 1,
    finishReason: "stop" as const,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    estimatedCost: null,
    latencyMs: 1,
    data,
  });

  return {
    projects: {
      getOwned: vi.fn(async () => ({
        id: PROJECT_ID,
        userId: USER_ID,
        title: "Promo roti",
        videoType: "discount_promo",
        styleId: "creative-mode",
        status: "awaiting_approval",
        settings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
        revisionRenderCount: 0,
        createdAt: "2026-09-30T00:00:00.000Z",
        updatedAt: "2026-09-30T00:00:00.000Z",
      })),
    },
    assets: { listOwned: vi.fn(async () => [pendingAsset, blockedAsset]) },
    briefRevisions: {
      latestOwned: vi.fn(async () => ({
        id: "44444444-4444-4444-8444-444444444444",
        projectId: PROJECT_ID,
        userId: USER_ID,
        version: 1,
        schemaVersion: "v1",
        isComplete: true,
        brief: {
          productName: "Roti Abon",
          productCategory: "Makanan",
          audience: "Umum",
          objective: "Naikkan penjualan",
          keyMessage: "Roti abon yang enak",
          offer: { label: "Promo", detail: "Diskon 10%" },
          callToAction: "Pesan sekarang",
          orderDestination: null,
          brandName: "Roti Abon",
          styleId: "creative-mode",
          outputSettings: { durationSeconds: 6, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: true },
          menuItems: null,
          facts: [
            { field: "offer.label", value: "Promo", source: "user_message" },
            { field: "offer.detail", value: "Diskon 10%", source: "user_message" },
          ],
        },
        generatedBy: { profileId: "primary", provider: "test", model: "test", promptVersion: "test", requestId: "request-1" },
        sourceMessageIds: [],
        createdAt: "2026-09-30T00:00:00.000Z",
      })),
    },
    artDirectionRevisions: { create: vi.fn(async (input) => ({ id: "art-direction-1", version: 1, createdAt: "now", ...input })) },
    compositionRevisions: { create: vi.fn(async (input) => ({ id: "composition-1", version: 1, createdAt: "now", ...input })) },
    artifacts: { create: vi.fn(async (input) => ({ createdAt: "now", ...input })) },
    events: { record: vi.fn(async () => undefined) },
    ai: {
      generateText: vi.fn(),
      generateStructured: vi.fn(async (request: { task: string }) => {
        if (request.task === "art_director") {
          return aiResult({
            mainMessage: "Promo",
            visualFocus: "Foto produk",
            hierarchy: ["produk", "promo", "ajakan"],
            mood: "Berani",
            imageTreatment: "Crop rapat",
            motionDirection: "Masuk singkat",
            beats: [
              { id: "product_reveal", intent: "Tampilkan produk", emphasis: "high" },
              { id: "offer_reveal", intent: "Tampilkan promo", emphasis: "high" },
              { id: "cta", intent: "Tutup dengan ajakan", emphasis: "medium" },
            ],
          });
        }
        return aiResult({
          schemaVersion: COMPOSITION_SPEC_VERSION,
          format: { aspectRatio: "9:16", fps: 30, durationSeconds: 6 },
          style: { id: "creative-mode", version: "1" },
          scenes: [{ id: "bad_plan", durationFrames: 180, modules: [{ id: "invented_module", kind: "internal", content: [] }] }],
        });
      }),
    },
    designPack: createFsDesignPackSource(process.cwd()),
    loadCatalog: async () => buildCatalog([], new Map()),
    compile: vi.fn(async () => ({
      compositionHash: "hash",
      prefix: "artifact-prefix",
      moduleVersions: {},
      assetHashes: { "assets/pending.jpg": pendingAsset.sha256 },
      catalogComponents: [],
    })),
    createId: vi.fn(() => "77777777-7777-4777-8777-777777777777"),
  } as unknown as ComposeDependencies;
}

describe("runComposition", () => {
  it("rechecks a stored complete flag before spending an AI call", async () => {
    const deps = dependencies();

    await expect(runComposition({ userId: USER_ID, projectId: PROJECT_ID }, deps)).rejects.toMatchObject({
      code: "video_approval_incomplete",
    });
    expect(deps.ai.generateStructured).not.toHaveBeenCalled();
  });

  it("passes pending uploads into planning and compilation while excluding blocked assets", async () => {
    const deps = completeDependencies();

    await expect(runComposition({ userId: USER_ID, projectId: PROJECT_ID }, deps)).resolves.toMatchObject({ isFallback: true });

    const compileCommand = vi.mocked(deps.compile).mock.calls[0][0];
    expect(compileCommand.assets.map((asset) => asset.id)).toEqual(["55555555-5555-4555-8555-555555555555"]);
    expect(compileCommand.spec.scenes[0]!.modules).toContainEqual({
      id: "ProductHero",
      kind: "internal",
      content: { assetId: "55555555-5555-4555-8555-555555555555" },
    });
  });
});
