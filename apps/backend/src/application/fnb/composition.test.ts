import { createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { SCENE_TIMELINE, STYLE_PRESETS, draftSchema, type CampaignDraft } from "../../domain/fnb/campaign";
import { buildComposition, type CompositionAsset } from "./composition";

const productAssetId = "00000000-0000-4000-8000-000000000001";

const logoAssetId = "00000000-0000-4000-8000-000000000002";

const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");

const assets: CompositionAsset[] = [{ id: productAssetId, mimeType: "image/png", bytes: imageBytes }, { id: logoAssetId, mimeType: "image/png", bytes: imageBytes }];

function campaignDraft(): CampaignDraft {
  return draftSchema.parse({
    brief: { campaignName: "Promo Kopi", productName: "Kopi Susu", brandName: "Kedai Kopi", originalPrice: 28000, discountPercent: 30, promoPeriod: "8–14 Oktober", cta: "Pesan kopi sekarang", productAssetId, logoAssetId },
    plan: { scenes: SCENE_TIMELINE.map((scene) => ({ ...scene, headline: "Kopi Susu", subheadline: "Kopi Susu dari Kedai Kopi", cta: "Pesan kopi sekarang", productAssetId })) },
    style: STYLE_PRESETS[0]!.tokens,
  });
}

describe("F&B frozen composition", () => {
  it("uses the registered library and exact four scene windows", async () => {
    const artifact = await buildComposition(campaignDraft(), assets);
    const document = new DOMParser().parseFromString(artifact.html, "text/html");
    const root = document.querySelector('[data-composition-id="fnb-campaign"]')!;
    expect(root.getAttribute("data-duration")).toBe("15");
    expect(root.getAttribute("data-width")).toBe("1080");
    expect(root.getAttribute("data-height")).toBe("1920");
    expect([...root.querySelectorAll(".clip")].map((clip) => ({ id: clip.getAttribute("data-scene"), start: Number(clip.getAttribute("data-start")), duration: Number(clip.getAttribute("data-duration")) }))).toEqual(SCENE_TIMELINE.map(({ id, start, duration }) => ({ id, start, duration })));
    expect(document.querySelector('[data-component="PromoEndCard"]')).not.toBeNull();
    expect(document.querySelector('[data-component="DiscountBadge"]')).not.toBeNull();
    expect(artifact.spec.scenes.every((scene) => scene.components.some((component) => component.motions.length))).toBe(true);
    expect(artifact.hash).toBe(createHash("sha256").update(artifact.html).digest("hex"));
  });


  it("binds computed prices and submitted assets without library demo placeholders", async () => {
    const artifact = await buildComposition(campaignDraft(), assets);
    const document = new DOMParser().parseFromString(artifact.html, "text/html");
    expect(document.querySelector('.hf-old-new-price__old')!.textContent).toBe("Rp 28.000");
    expect(document.querySelector('.hf-old-new-price__new')!.textContent).toBe("Rp 19.600");
    expect(document.querySelector('.hf-discount-badge__value')!.textContent).toBe("30%");
    expect([...document.querySelectorAll("img")].every((image) => image.getAttribute("src") === `data:image/png;base64,${imageBytes.toString("base64")}`)).toBe(true);
    expect(document.body.textContent).not.toContain("while stocks last");
    expect(document.body.textContent).not.toContain("per cup");
  });

  it("treats user text as DOM text, never markup or runtime code", async () => {
    const draft = campaignDraft();
    const hostile = '</script><img src=x onerror="alert()"> & <style>body{display:none}</style>';
    draft.plan.scenes[0].headline = hostile;
    const artifact = await buildComposition(draft, assets);
    const document = new DOMParser().parseFromString(artifact.html, "text/html");
    expect(document.querySelector('.hf-big-statement__headline')!.textContent).toBe(hostile);
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("omits the demo logo and shows only the submitted brand when no logo exists", async () => {
    const draft = campaignDraft();
    draft.brief.logoAssetId = null;
    const artifact = await buildComposition(draft, assets.slice(0, 1));
    const document = new DOMParser().parseFromString(artifact.html, "text/html");
    expect(document.querySelector('img[data-asset="logo"]')).toBeNull();
    expect(document.querySelector(".fnb-brand-name")!.textContent).toBe(draft.brief.brandName);
    expect(artifact.html).not.toContain("Daily demo brand");
  });


  it("rejects missing, duplicate and unsupported assets instead of using demo artwork", async () => {
    await expect(buildComposition(campaignDraft(), [])).rejects.toThrow("Missing product asset");
    await expect(buildComposition(campaignDraft(), [assets[0]!, assets[0]!])).rejects.toThrow("Duplicate composition asset");
    await expect(buildComposition(campaignDraft(), [{ ...assets[0]!, mimeType: "image/svg+xml" }, assets[1]!])).rejects.toThrow("Unsupported image asset");
  });

  it("rejects injected CSS and invalid contrast before composing", async () => {
    const draft = campaignDraft();
    draft.style.primary = '#000000;}</style><script>alert(1)</script>';
    await expect(buildComposition(draft, assets)).rejects.toThrow();
    draft.style = { ...STYLE_PRESETS[0]!.tokens, text: STYLE_PRESETS[0]!.tokens.background };
    await expect(buildComposition(draft, assets)).rejects.toThrow();
  });

  it("freezes deterministic HTML and changes the hash when a saved fact changes", async () => {
    const draft = campaignDraft();
    const first = await buildComposition(draft, assets);
    expect((await buildComposition(draft, assets)).html).toBe(first.html);
    draft.brief.discountPercent = 40;
    const changed = await buildComposition(draft, assets);
    expect(changed.hash).not.toBe(first.hash);
    expect(changed.spec.discountedPrice).toBe(16800);
  });
});

