import { describe, expect, it, vi } from "vitest";
import type { GenerateTextRequest } from "../../domain/ai-service/types";
import { COMPOSITION_SPEC_VERSION, type CompositionSpec } from "../../domain/video-engine/composition";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import { assertCompositionHtml, CompositionAuthorError, runCompositionAuthor } from "./composition-author";

const spec: CompositionSpec = {
  schemaVersion: COMPOSITION_SPEC_VERSION,
  format: { aspectRatio: "9:16", fps: 30, durationSeconds: 4 },
  style: { id: "creative-mode", version: "1" },
  scenes: [{ id: "product_reveal", durationFrames: 120, modules: [{ id: "ProductHero", kind: "internal", content: { assetId: "photo-1" } }] }],
};

const html = `<!doctype html><html lang="id"><head><style>body { margin: 0 }</style></head><body>
<div data-composition-id="main" data-fps="30" data-duration="4" data-width="720" data-height="1280">
<section data-scene="product_reveal" data-start="0" data-duration="4" data-track-index="0" class="clip hf-scene"><div class="hf-scene__content"><figure class="hf-module"><img src="assets/photo.jpg"></figure></div></section>
</div><script src="vendor/gsap.min.js"></script><script>const tl = gsap.timeline({paused:true}); tl.fromTo('figure',{rotate:-35},{rotate:0,duration:2},0); window.__timelines["main"] = tl;</script></body></html>`;

const frame = { width: 720, height: 1280 };

describe("AI composition document", () => {
  it("accepts authored choreography not limited to planner motion labels", () => {
    expect(() => assertCompositionHtml(html, spec, frame)).not.toThrow();
  });

  it.each([
    'window.__timelines.main = tl;',
    'window.__timelines . main = tl;',
    'window.__timelines["main"] = tl;',
    "window.__timelines[ 'main' ] = tl;",
  ])("accepts equivalent main timeline registration: %s", (registration) => {
    const candidate = html.replace('window.__timelines["main"] = tl;', registration);
    expect(() => assertCompositionHtml(candidate, spec, frame)).not.toThrow();
  });

  it.each([
    "window.__timelines.other = tl;",
    "window.__timelines.mainExtra = tl;",
    "window.__timelines.MAIN = tl;",
    'window.__timelines["MAIN"] = tl;',
    "window.__timelines.main === tl;",
    'window.__timelines["main"] == tl;',
  ])("rejects a missing main timeline assignment: %s", (registration) => {
    const candidate = html.replace('window.__timelines["main"] = tl;', registration);
    expect(() => assertCompositionHtml(candidate, spec, frame)).toThrow(CompositionAuthorError);
  });

  it("accepts rounded decimal seconds that still land on the approved frames", () => {
    const twoScenes = {
      ...spec,
      scenes: [
        { ...spec.scenes[0]!, durationFrames: 40 },
        { ...spec.scenes[0]!, id: "close", durationFrames: 80 },
      ],
    };
    const rounded = html
      .replace('data-duration="4" data-track-index', 'data-duration="1.333" data-track-index')
      .replace("</section>", '</section><section class="clip hf-scene" data-scene="close" data-start="1.333" data-duration="2.667" data-track-index="0"><div class="hf-scene__content"><p class="hf-module">Roti</p></div></section>');
    expect(() => assertCompositionHtml(rounded, twoScenes, frame)).not.toThrow();
  });

  it.each([
    html.replace('data-duration="4" data-track-index', 'data-duration="3" data-track-index'),
    html.replace('data-scene="product_reveal"', 'data-scene="other"'),
    html.replace('assets/photo.jpg', 'https://example.com/photo.jpg'),
    html.replace('data-fps="30"', 'data-fps="60"'),
    html.replace('data-width="720"', 'data-width="1080"'),
    html.replace('vendor/gsap.min.js', 'vendor/missing.js'),
    html.replace('window.__timelines["main"] = tl;', ''),
    `\`\`\`html\n${html}\n\`\`\``,
  ])("rejects an incomplete, mis-timed, or externally dependent document", (candidate) => {
    expect(() => assertCompositionHtml(candidate, spec, frame)).toThrow(CompositionAuthorError);
  });

  it.each([html, "<!doctype html><html>truncated"])("validates generated replacement HTML and preserves rejected bytes", async (replacement) => {
    const ai = {
      generateText: vi.fn(async (_request: GenerateTextRequest) => ({
        text: replacement,
        requestId: "request-html", profileId: "primary", provider: "test", model: "test", providerRequestId: null,
        attemptCount: 1, finishReason: "stop" as const,
        usage: { inputTokens: 100, outputTokens: 300, totalTokens: 400 }, estimatedCost: null, latencyMs: 1,
      })),
      generateStructured: vi.fn(),
    };
    const designPack = await createFsDesignPackSource().load({ id: "creative-mode", version: "1" });
    const promise = runCompositionAuthor({
      userId: "user-1", projectId: "project-1", spec, designPack, resolution: "720p", language: "id",
      brief: { productName: "Roti", brandName: null, keyMessage: "Roti", callToAction: null, orderDestination: null, audience: null, objective: null, productCategory: null, offer: null, menuItems: null },
      artDirection: { mainMessage: "Roti", visualFocus: "Foto produk", hierarchy: ["Roti"], mood: "Hangat", imageTreatment: "Crop", motionDirection: "Putar", beats: [{ id: "product_reveal", intent: "Produk", emphasis: "high" }] },
      assets: [{ id: "photo-1", objectKey: "owned/photo.jpg", sha256: "a".repeat(64), mimeType: "image/jpeg", fileName: "photo.jpg" }],
      blocks: new Map(),
      correction: { previousHtml: "previous rejected document", issues: [{ code: "html_document_invalid", message: "Incomplete document" }] },
    }, { ai, createRequestId: () => "request-html" });

    if (replacement === html) {
      await expect(promise).resolves.toMatchObject({ html, ai: { requestId: "request-html" } });
    } else {
      await expect(promise).rejects.toBeInstanceOf(CompositionAuthorError);
      await expect(promise).rejects.toMatchObject({ html: replacement, requestId: "request-html", issueCode: "html_document_invalid" });
    }
    expect(ai.generateText).toHaveBeenCalledOnce();
  });
});
