import { createHash } from "node:crypto";
import { DOMParser, HTMLElement } from "linkedom";
import { draftSchema, discountedPrice, formatPrice, inkForColor, type CampaignDraft, type Scene, type StyleTokens } from "../../domain/fnb/campaign";
import { getCompositionLibrary, type ComponentName, type CompositionLibrary, type MotionName } from "./composition-registry";
import { buildMotionRuntime, type ResolvedMotion } from "./composition-motion";

export interface CompositionAsset { id: string; mimeType: string; bytes: Uint8Array }

export interface CompositionComponent {
  id: string;
  component: ComponentName;
  variant: string;
  bindings: Record<string, string>;
  motions: Array<{ preset: MotionName; hook: string; targetId: string; start: number }>;
}

export interface CompositionSpec {
  version: 1;
  libraryVersion: string;
  compositionId: "fnb-campaign";
  width: 1080;
  height: 1920;
  duration: 15;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  style: StyleTokens;
  scenes: Array<{ id: Scene["id"]; start: number; duration: number; components: CompositionComponent[] }>;
}

export interface CompositionArtifact { html: string; hash: string; spec: CompositionSpec }

function parseComponent(library: CompositionLibrary, name: ComponentName, variant: string): HTMLElement {
  const entry = library.registry.components[name];
  const fragment = library.fragments[name];

  if (!entry || !fragment || !entry.variants.includes(variant)) throw new Error(`Unregistered component variant ${name}/${variant}`);
  const document = new DOMParser().parseFromString(`<html><body>${fragment}</body></html>`, "text/html");
  const element = document.body.firstElementChild;

  if (!(element instanceof HTMLElement) || document.body.children.length !== 1 || !element.matches(entry.selector)) throw new Error(`Invalid library fragment ${name}`);

  if (element.querySelector("script,iframe,object,embed,link")) throw new Error(`Executable library fragment ${name}`);
  element.setAttribute("data-variant", variant);

  return element;
}

function bindText(element: HTMLElement, bindings: Record<string, string>) {
  for (const [hook, value] of Object.entries(bindings)) {
    const targets = [element, ...element.querySelectorAll(`[data-animate="${hook}"]`)].filter((target) => target.getAttribute("data-animate") === hook);

    if (!targets.length) throw new Error(`Missing text binding ${hook}`);

    for (const target of targets) target.textContent = value;
  }
}

type CompositionImages = {
  assets: Map<string, CompositionAsset>;
  sources: Map<string, string>;
};

function bindAssets(element: HTMLElement, draft: CampaignDraft, scene: Scene, images: CompositionImages) {
  for (const image of element.querySelectorAll("img[data-asset]")) {
    const role = image.getAttribute("data-asset");
    const id = role === "product" ? scene.productAssetId : role === "logo" ? draft.brief.logoAssetId : null;

    if (role === "logo" && !id) {
      const brand = image.ownerDocument.createElement("span");
      brand.setAttribute("class", "fnb-brand-name");
      brand.setAttribute("data-animate", "logo");
      brand.textContent = draft.brief.brandName;
      image.replaceWith(brand);
      continue;
    }

    const asset = id ? images.assets.get(id) : undefined;

    if (!asset) throw new Error(`Missing ${role} asset ${id ?? ""}`);

    if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType) || !asset.bytes.length) throw new Error(`Unsupported image asset ${id}`);
    let source = images.sources.get(asset.id);

    if (!source) {
      source = `data:${asset.mimeType};base64,${Buffer.from(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength).toString("base64")}`;
      images.sources.set(asset.id, source);
    }

    image.setAttribute("src", source);
    image.setAttribute("alt", role === "product" ? draft.brief.productName : draft.brief.brandName);
  }
}

function attachMotion(context: { element: HTMLElement; component: CompositionComponent; library: CompositionLibrary; resolved: ResolvedMotion[] }, motion: { preset: MotionName; hook: string; start: number }) {
  const { element, component, library, resolved } = context;
  const entry = library.registry.components[component.component];
  const definition = library.motions[motion.preset];

  if (!definition || !entry?.compatibleMotions.includes(motion.preset) || !definition.targets.includes(motion.hook)
    || !library.motionRegistry.motions[motion.preset]?.compatibleTargets.includes(motion.hook)) throw new Error(`Incompatible motion ${component.component}/${motion.preset}/${motion.hook}`);
  const targets = [element, ...element.querySelectorAll(`[data-animate="${motion.hook}"]`)].filter((target) => target.getAttribute("data-animate") === motion.hook);

  if (!targets.length) throw new Error(`Missing animation hook ${motion.hook}`);

  for (const [index, target] of targets.entries()) {
    const targetId = `${component.id}-motion-${component.motions.length}-${index}`;
    const layer = target.ownerDocument.createElement("span");
    layer.setAttribute("id", targetId);
    layer.setAttribute("class", "fnb-motion");

    // The authored node owns layout/rotate/scale; only its neutral inner layer moves.
    if (target.tagName === "IMG") {
      const shell = target.ownerDocument.createElement("span");
      shell.setAttribute("class", `${target.getAttribute("class") ?? ""} fnb-asset-shell`);
      shell.setAttribute("data-animate", motion.hook);
      target.removeAttribute("class");
      target.removeAttribute("data-animate");
      target.replaceWith(shell);
      layer.appendChild(target);
      shell.appendChild(layer);
    } else {
      while (target.firstChild) layer.appendChild(target.firstChild);
      target.appendChild(layer);
    }

    component.motions.push({ preset: motion.preset, hook: motion.hook, targetId, start: motion.start });
    resolved.push({ preset: motion.preset, targetId, start: motion.start, definition });
  }
}

function styleCss(style: StyleTokens): string {
  const fonts: Record<StyleTokens["typography"], string> = { bold: "FnbSans,sans-serif", editorial: "FnbSerif,serif", clean: "FnbSans,sans-serif" };
  const font = fonts[style.typography];

  return `:root{--brand-primary:${style.primary};--brand-secondary:${style.secondary};--brand-accent:${style.accent};--background:${style.background};--text-primary:${style.text};--text-secondary:${style.text};--font-body:${font};--font-display:${font};--badge-ink:${inkForColor(style.accent)}}
html,body{width:100%;height:100%;overflow:hidden}#fnb-campaign{position:relative;width:100%;height:100%;overflow:hidden;background:var(--background)}
.fnb-scene{position:absolute;inset:0;width:100%;height:100%}.fnb-scene-body{position:relative;z-index:1;width:100%;height:100%;padding:14.222% 8% 21.333%;display:grid;grid-template-rows:25% 51% 24%;gap:0}
.fnb-scene[data-scene="discount"] .fnb-scene-body{grid-template-rows:20% 38% 22% 20%}.fnb-scene[data-scene="end-card"] .fnb-scene-body{grid-template-rows:18% 10% 72%}
.fnb-copy{display:flex;flex-direction:column;justify-content:center;gap:20px;min-width:0;min-height:0}.fnb-copy [data-component]{max-width:100%}.fnb-motion{display:block;width:100%;opacity:0;transform-origin:center center}.fnb-asset-shell{display:block;position:relative}.fnb-asset-shell>.fnb-motion{width:100%;height:100%}.fnb-asset-shell img{width:100%;height:100%;object-fit:contain}
.hf-brand-background{--background-color:${style.backgroundTreatment === "solid" ? style.background : style.secondary};--background-secondary:${style.background}}
.hf-big-statement{--headline-size:${style.density === "bold" ? "11cqw" : "9cqw"};font-weight:${style.typography === "clean" ? "600" : style.typography === "editorial" ? "700" : "900"};height:100%;overflow:visible;line-height:1.05;letter-spacing:-.035em}.hf-big-statement__headline{display:block;width:100%;overflow-wrap:anywhere;text-transform:none}
.hf-flavor-callout[data-variant] .hf-flavor-callout__headline{font-size:4.4cqw;line-height:1.2;font-style:normal;font-family:var(--font-body);overflow-wrap:anywhere}.hf-flavor-callout__detail{font-size:3.2cqw;overflow-wrap:anywhere}
.hf-product-hero{min-height:0;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);--product-scale:1;--product-rotation:0deg}.hf-product-hero>.fnb-asset-shell{min-height:0;min-width:0;height:100%}.hf-product-hero__image{filter:none}.hf-product-hero__shadow{display:none}
.hf-discount-badge{--badge-size:45cqw;--discount-size:14cqw;justify-self:center}.hf-discount-badge__label{font-size:4cqw}.hf-discount-badge__value{display:block;width:100%}
.hf-old-new-price{flex-direction:column;align-items:center;gap:16px}.hf-old-new-price__old{font-size:4cqw;color:var(--text-primary)}.hf-old-new-price__new{font-size:8cqw;color:var(--text-primary)}
.hf-order-now-cta{padding:4% 2%;font-size:4.5cqw;overflow-wrap:anywhere}.hf-order-now-cta[data-variant=banner]{color:${inkForColor(style.accent)};font-size:4.5cqw}
.hf-promo-end-card{grid-template-columns:1fr 1fr;grid-template-rows:14% 60% 16% 10%;gap:0}.hf-promo-end-card>.hf-product-hero{--product-scale:1}.hf-promo-end-card>.hf-price-smash{--price-size:7cqw;color:var(--text-primary)}.hf-promo-end-card .hf-price-smash__price{letter-spacing:-.03em;overflow-wrap:anywhere}.hf-promo-end-card .hf-price-smash__prefix{font-size:3cqw}.hf-promo-end-card .hf-price-smash__suffix{font-size:3cqw;overflow-wrap:anywhere}.hf-promo-end-card__date{font-size:3cqw;overflow-wrap:anywhere}.fnb-brand-name{font-size:4.5cqw;font-weight:700;overflow-wrap:anywhere}.hf-logo-lockup__logo{max-height:100%;object-fit:contain}
.hf-promo-end-card>.hf-price-smash[data-variant] .hf-price-smash__price{font-size:7cqw;line-height:1.1;white-space:nowrap}
`;
}

export async function buildComposition(input: CampaignDraft, assetList: CompositionAsset[]): Promise<CompositionArtifact> {
  const draft = draftSchema.parse(input);
  const library = await getCompositionLibrary();
  const images: CompositionImages = { assets: new Map(), sources: new Map() };

  for (const asset of assetList) {
    if (images.assets.has(asset.id)) throw new Error(`Duplicate composition asset ${asset.id}`);
    images.assets.set(asset.id, asset);
  }

  const document = new DOMParser().parseFromString('<!doctype html><html lang="id"><head><meta charset="utf-8"></head><body></body></html>', "text/html");
  const root = document.createElement("div", undefined);

  for (const [name, value] of Object.entries({ id: "fnb-campaign", "data-composition-id": "fnb-campaign", "data-width": "1080", "data-height": "1920", "data-duration": "15" })) root.setAttribute(name, value);
  document.body.appendChild(root);
  const price = discountedPrice(draft.brief.originalPrice, draft.brief.discountPercent);
  const spec: CompositionSpec = { version: 1, libraryVersion: library.registry.version, compositionId: "fnb-campaign", width: 1080, height: 1920, duration: 15, originalPrice: draft.brief.originalPrice, discountedPrice: price, discountPercent: draft.brief.discountPercent, style: draft.style, scenes: [] };
  const resolved: ResolvedMotion[] = [];

  for (const scene of draft.plan.scenes) {
    const container = document.createElement("section", undefined);
    container.setAttribute("class", "clip hf-frame fnb-scene");

    for (const [name, value] of Object.entries({ "data-scene": scene.id, "data-start": String(scene.start), "data-duration": String(scene.duration), "data-track-index": "0", id: `fnb-${scene.id}` })) container.setAttribute(name, value);
    const body = document.createElement("div", undefined);
    body.setAttribute("class", "fnb-scene-body");
    const sceneSpec: CompositionSpec["scenes"][number] = { id: scene.id, start: scene.start, duration: scene.duration, components: [] };

    function addComponent(name: ComponentName, variant: string, bindings: Record<string, string>, parent = body, motion?: { preset: MotionName; hook: string; start: number }) {
      const element = parseComponent(library, name, variant);
      const component: CompositionComponent = { id: `fnb-${scene.id}-${sceneSpec.components.length}`, component: name, variant, bindings, motions: [] };
      element.id = component.id;
      bindText(element, bindings);
      bindAssets(element, draft, scene, images);

      if (name === "DiscountBadge") element.querySelector(".hf-discount-badge__label")!.textContent = "Diskon";

      if (name === "PromoEndCard") component.bindings = { ...bindings, productAssetId: scene.productAssetId, logoAssetId: draft.brief.logoAssetId ?? "", brandName: draft.brief.brandName };
      else if (name === "ProductHero") component.bindings.productAssetId = scene.productAssetId;

      if (motion) attachMotion({ element, component, library, resolved }, motion);

      if (name === "BigStatement") {
        const headline = element.querySelector(".hf-big-statement__headline")!;
        headline.setAttribute("data-fnb-fit-width", "900");
        headline.setAttribute("data-fnb-fit-height", scene.id === "end-card" ? "245" : scene.id === "discount" ? "280" : "350");
      }

      if (name === "FlavorCallout") {
        const headline = element.querySelector(".hf-flavor-callout__headline")!;
        headline.setAttribute("data-fnb-fit-width", "900");
        headline.setAttribute("data-fnb-fit-height", scene.id === "end-card" ? "135" : "190");
      }

      for (const cta of element.querySelectorAll('[data-animate="cta"]')) {
        cta.setAttribute("data-fnb-fit-width", "840");
        cta.setAttribute("data-fnb-fit-height", "100");
      }

      for (const price of element.querySelectorAll('[data-animate="price"]')) {
        price.setAttribute("data-fnb-fit-width", name === "PromoEndCard" ? "400" : "900");
        price.setAttribute("data-fnb-fit-height", "220");
      }

      for (const text of element.querySelectorAll('[data-animate="detail"],[data-animate="date"],[data-animate="suffix"],.fnb-brand-name')) {
        text.setAttribute("data-fnb-fit-width", text.getAttribute("data-animate") === "suffix" ? "400" : "900");
        text.setAttribute("data-fnb-fit-height", "75");
      }

      parent.appendChild(element);
      sceneSpec.components.push(component);
    }

    addComponent("BrandBackground", draft.style.backgroundTreatment, {}, container);
    addComponent("BigStatement", "left", { headline: scene.headline }, body, { preset: "typography.kinetic-up", hook: "headline", start: scene.start });

    if (scene.id === "end-card") {
      addComponent("FlavorCallout", "minimal", { headline: scene.subheadline, detail: "" });
      addComponent("PromoEndCard", "product-first", { prefix: "Harga promo", price: formatPrice(price), suffix: draft.brief.productName, cta: scene.cta || draft.brief.cta, date: draft.brief.promoPeriod }, body, { preset: "product.float-in", hook: "product", start: scene.start });
    } else {
      if (scene.id === "discount") {
        addComponent("DiscountBadge", "circle", { discount: `${draft.brief.discountPercent}%` }, body, { preset: "promo.badge-pop", hook: "discount", start: scene.start + 0.15 });
        addComponent("OldNewPrice", "stacked", { "old-price": formatPrice(draft.brief.originalPrice), price: formatPrice(price) });
      } else {
        addComponent("ProductHero", "clean", {}, body, { preset: "product.slide-up", hook: "product", start: scene.start + 0.1 });
      }

      const copy = document.createElement("div", undefined);
      copy.setAttribute("class", "fnb-copy");
      body.appendChild(copy);
      addComponent("FlavorCallout", "minimal", { headline: scene.subheadline, detail: scene.id === "discount" ? draft.brief.promoPeriod : draft.brief.productName }, copy);

      if (scene.cta) addComponent("OrderNowCTA", "banner", { cta: scene.cta }, copy);
    }

    container.appendChild(body);
    root.appendChild(container);
    spec.scenes.push(sceneSpec);
  }

  for (const image of root.querySelectorAll("img")) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image.getAttribute("src") ?? "")) throw new Error("Unresolved composition image");
  }

  const style = document.createElement("style", undefined);
  style.textContent = library.css + "\n" + styleCss(draft.style);
  document.head.appendChild(style);
  // Freeze the dependency bytes without mixing GSAP's ticker internals into authored motion.
  const gsap = document.createElement("script", undefined);
  gsap.setAttribute("src", `data:text/javascript;base64,${Buffer.from(library.gsap).toString("base64")}`);
  document.body.appendChild(gsap);
  const motion = document.createElement("script", undefined);
  motion.textContent = buildMotionRuntime(resolved).replace(/<\/script/gi, "<\\/script");
  document.body.appendChild(motion);
  const html = document.toString();

  return { html, hash: createHash("sha256").update(html).digest("hex"), spec };
}
