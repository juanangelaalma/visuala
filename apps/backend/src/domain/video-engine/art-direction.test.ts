import { describe, expect, it } from "vitest";
import { artDirectionBeatIssues, artDirectionSchema, type ArtDirection } from "./art-direction";
import { recipeById } from "./recipes/registry";

/** product_promo's beats are hook, message, proof, cta. */
const BEATS: ArtDirection["beats"] = [
  { id: "hook", intent: "open on the product", emphasis: "high" },
  { id: "message", intent: "state the key message", emphasis: "high" },
  { id: "proof", intent: "hold on the product", emphasis: "medium" },
  { id: "cta", intent: "close on the call to action", emphasis: "high" },
];

function direction(overrides: Partial<ArtDirection> = {}): ArtDirection {
  return {
    mainMessage: "Diskon 20% untuk semua menu",
    visualFocus: "the product photo, full bleed",
    hierarchy: ["headline", "offer badge", "cta"],
    mood: "bold and warm",
    imageTreatment: "crop tight on the product, no filter",
    motionDirection: "short rises, no bounce",
    beats: BEATS,
    ...overrides,
  };
}

describe("art direction schema", () => {
  it("parses a complete direction", () => {
    expect(artDirectionSchema.parse(direction())).toEqual(direction());
  });

  it("rejects an empty main message and an unknown emphasis", () => {
    expect(artDirectionSchema.safeParse(direction({ mainMessage: "" })).success).toBe(false);

    const broken = { ...direction(), beats: [{ ...BEATS[0], emphasis: "urgent" }] };
    expect(artDirectionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects extra keys, so a model cannot smuggle an unvalidated field through", () => {
    expect(artDirectionSchema.safeParse({ ...direction(), storyboard: {} }).success).toBe(false);
  });
});

describe("artDirectionBeatIssues", () => {
  it("accepts beats that match the recipe exactly", () => {
    expect(artDirectionBeatIssues(direction(), recipeById("product_promo"))).toEqual([]);
  });

  it("reports an invented beat", () => {
    const withExtra = direction({
      beats: [...BEATS, { id: "price_tease", intent: "tease the price", emphasis: "low" }],
    });
    expect(artDirectionBeatIssues(withExtra, recipeById("product_promo"))).toEqual(["unknown beat ids: price_tease"]);
  });

  it("reports a dropped beat", () => {
    const issues = artDirectionBeatIssues(
      direction({ beats: [BEATS[0]] }),
      recipeById("product_promo"),
    );

    expect(issues).toEqual(["missing beat ids: message, proof, cta"]);
  });

  it("reports a duplicated beat", () => {
    const issues = artDirectionBeatIssues(
      direction({ beats: [BEATS[0], { ...BEATS[0], intent: "stop it again" }, ...BEATS.slice(1)] }),
      recipeById("product_promo"),
    );

    expect(issues).toEqual(["duplicated beat ids: hook"]);
  });
});
