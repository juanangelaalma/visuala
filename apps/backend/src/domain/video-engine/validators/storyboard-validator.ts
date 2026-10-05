import type { CompositionModuleInstance, CompositionScene } from "../composition";
import { normalize } from "../facts";
import { beatPurpose, closingCopy } from "../storyboard";
import type { RecipeBeat } from "../recipes/types";
import { isTextSlot } from "./fact-validator";
import type { ValidationInput, ValidationIssue } from "./types";

/** Planning-only gate: old stored specs retain their schema, while new plans must realise each recipe beat. */
export function validateStoryboard(input: ValidationInput): ValidationIssue[] {
  const { spec, recipe } = input;
  const issues: ValidationIssue[] = [];
  if (spec.scenes.length !== recipe.beats.length || spec.scenes.some((scene, index) => scene.id !== recipe.beats[index]?.id)) {
    issues.push({ code: "beat_order_invalid", message: `Scenes must realise ${recipe.beats.map((beat) => beat.id).join(", ")} exactly once, in that order.` });
  }

  for (const [index, scene] of spec.scenes.entries()) {
    const modules = scene.modules.filter((module) => module.kind === "internal");
    if (scene.motion === "product_push" && !modules.some((module) => module.id === "ProductHero")) {
      issues.push({ code: "motion_incompatible", message: "product_push requires a ProductHero in this scene.", sceneId: scene.id });
    }
    if (index !== spec.scenes.length - 1 && modules.some((module) => module.id === "CTA")) {
      issues.push({ code: "cta_not_closing", message: "Reserve the CTA for the closing beat.", sceneId: scene.id, moduleId: "CTA" });
    }
    issues.push(...repeatedCopy(scene, input));
    const beat = recipe.beats[index];
    if (beat && !hasBeatFocus(scene, beat, input)) {
      issues.push({ code: "beat_focus_invalid", message: `Scene ${scene.id} must focus only on the ${beatPurpose(beat)} purpose of ${beat.id}.`, sceneId: scene.id });
    }
  }
  return issues;
}

function repeatedCopy(scene: CompositionScene, input: ValidationInput): ValidationIssue[] {
  const seen: { module: CompositionModuleInstance; value: string }[] = [];
  const issues: ValidationIssue[] = [];
  for (const module of scene.modules) {
    for (const [key, value] of Object.entries(module.content)) {
      if (!isTextSlot(module.kind, module.id, key, input.catalog)) continue;
      const copy = normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!copy) continue;
      const duplicate = seen.find((previous) => ` ${previous.value} `.includes(` ${copy} `) || ` ${copy} `.includes(` ${previous.value} `));
      if (duplicate) issues.push({ code: "copy_repeated", message: `${module.id} repeats copy already shown by ${duplicate.module.id} in this scene.`, sceneId: scene.id, moduleId: module.id });
      seen.push({ module, value: copy });
    }
  }
  return issues;
}

function hasBeatFocus(scene: CompositionScene, beat: RecipeBeat, input: ValidationInput): boolean {
  const modules = scene.modules.filter((module) => module.kind === "internal" && module.id !== "BackgroundTexture");
  const ids = modules.map((module) => module.id);
  if (ids.some((id, index) => ids.indexOf(id) !== index)) return false;
  const copy = modules.flatMap((module) => Object.entries(module.content)
    .filter(([key]) => isTextSlot(module.kind, module.id, key, input.catalog)).map(([, value]) => ({ moduleId: module.id, text: normalize(value) })));
  const texts = copy.map(({ text }) => text);
  const contains = (value: string) => texts.some((text) => text.includes(normalize(value)));
  const only = (...allowed: string[]) => ids.every((id) => allowed.includes(id));

  const names = [input.brief.productName, input.brief.brandName].filter((name): name is string => Boolean(name)).map(normalize);
  const offerLabel = normalize(input.brief.offer?.label ?? "");
  const offerDetail = normalize(input.brief.offer?.detail ?? "");
  const action = normalize(closingCopy(input.brief, beat));
  const destination = normalize(input.brief.orderDestination ?? "");
  const message = normalize(input.brief.keyMessage);
  switch (beatPurpose(beat)) {
    case "product":
      return only("ProductHero", "Headline", "BrandMark", "SupportingCopy")
        && ids.filter((id) => id === "ProductHero").length <= 1
        && (input.assets.length > 0 ? ids.includes("ProductHero") : contains(input.brief.productName))
        && copy.every(({ moduleId, text }) => names.includes(text) || (moduleId === "SupportingCopy" && text === message));
    case "offer":
      return only("OfferBadge", "SupportingCopy", "BrandMark")
        && ids.filter((id) => id === "OfferBadge").length === 1
        && modules.some((module) => module.id === "OfferBadge" && normalize(module.content.text ?? "") === offerLabel)
        && texts.every((text) => names.includes(text) || text === offerLabel || text === offerDetail);
    case "closing":
      return only("CTA", "SupportingCopy", "BrandMark")
        && ids.filter((id) => id === "CTA").length === 1
        && modules.some((module) => module.id === "CTA" && normalize(module.content.text ?? "") === action)
        && copy.every(({ moduleId, text }) => names.includes(text) || text === action || text === destination || (moduleId === "SupportingCopy" && text === message));
    case "message":
      return only("Headline", "SupportingCopy", "BrandMark") && texts.includes(message)
        && texts.every((text) => names.includes(text) || text === message);
    case "tease":
      return only("Headline", "SupportingCopy", "BrandMark") && texts.length > 0 && texts.every((text) => names.includes(text));
    case "menu":
      return only("Headline", "SupportingCopy", "Price", "BrandMark")
        && (input.brief.menuItems?.every((item) => contains(item.name)) ?? false);
  }
}
