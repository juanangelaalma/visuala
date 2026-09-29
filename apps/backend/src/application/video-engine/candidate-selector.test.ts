import { describe, expect, it } from "vitest";
import { buildCatalog } from "../../domain/video-engine/catalog";
import type { Catalog, CatalogItem, CatalogItemDetails } from "../../domain/video-engine/catalog";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import { recipeById } from "../../domain/video-engine/recipes/registry";
import { selectCatalogCandidates } from "./candidate-selector";

const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };

function item(overrides: Partial<CatalogItem> & { name: string }): CatalogItem {
  return { type: "block", title: overrides.name, description: "", tags: [], ...overrides };
}

function details(name: string, extra: Partial<CatalogItemDetails> = {}): CatalogItemDetails {
  return { name, type: "block", tags: [], files: [], registryDependencies: [], variables: [], ...extra };
}

function catalog(items: CatalogItem[], detailMap: Record<string, CatalogItemDetails> = {}): Catalog {
  return buildCatalog(items, new Map(Object.entries(detailMap)));
}

const artDirection: ArtDirection = {
  mainMessage: "Diskon 20%",
  visualFocus: "the product photo",
  hierarchy: ["headline", "offer"],
  mood: "bold",
  imageTreatment: "crop tight",
  motionDirection: "short rises",
  beats: [
    { id: "hook", intent: "show the product reveal", emphasis: "high" },
    { id: "message", intent: "state the offer discount", emphasis: "high" },
    { id: "proof", intent: "hold on the product", emphasis: "low" },
    { id: "cta", intent: "ask for the order", emphasis: "low" },
  ],
};

function select(overrides: Partial<Parameters<typeof selectCatalogCandidates>[0]> = {}) {
  return selectCatalogCandidates({
    catalog: catalog([
      item({ name: "product-reveal", title: "Product Reveal", description: "reveals the product", tags: ["product"], dimensions: PORTRAIT, duration: 6 }),
      item({ name: "discount-badge", title: "Discount Badge", description: "a discount offer badge", tags: ["offer"], dimensions: PORTRAIT, duration: 4 }),
      item({ name: "landscape-promo", title: "Product Promo Landscape", description: "product offer reveal", dimensions: LANDSCAPE, duration: 8 }),
      item({ name: "long-promo", title: "Product Promo Long", description: "product offer reveal", dimensions: PORTRAIT, duration: 30 }),
      item({ name: "unshaped-promo", title: "Product Promo Unshaped", description: "product offer reveal" }),
      item({ name: "product-component", type: "component", title: "Product Reveal Component", description: "product reveal", dimensions: PORTRAIT, duration: 2 }),
    ]),
    recipe: recipeById("product_promo"),
    artDirection,
    aspectRatio: "9:16",
    durationSeconds: 12,
    ...overrides,
  });
}

describe("selectCatalogCandidates", () => {
  it("offers only blocks with a declared frame and duration, at the right ratio, inside the video length", () => {
    const names = select().candidates.map((candidate) => candidate.name);

    expect(names).toContain("product-reveal");
    expect(names).toContain("discount-badge");
    expect(names).not.toContain("landscape-promo");
    expect(names).not.toContain("long-promo");
    expect(names).not.toContain("unshaped-promo");
    expect(names).not.toContain("product-component");
  });

  it("records one candidate per block with every beat that matched it", () => {
    const candidates = select().candidates;
    const reveal = candidates.find((candidate) => candidate.name === "product-reveal");

    expect(candidates.filter((candidate) => candidate.name === "product-reveal")).toHaveLength(1);
    expect(reveal?.beats.length).toBeGreaterThanOrEqual(1);
    expect(reveal?.beats.length).toBeLessThanOrEqual(recipeById("product_promo").beats.length);
  });

  it("carries the declared variables of a candidate, so the planner can set them", () => {
    const selection = select({
      catalog: catalog(
        [item({ name: "product-reveal", title: "Product Reveal", description: "reveals the product", dimensions: PORTRAIT, duration: 6 })],
        {
          "product-reveal": details("product-reveal", {
            variables: [{ id: "headline", type: "string", role: "content" }, { id: "accent", type: "color", role: "style" }],
          }),
        },
      ),
    });

    expect(selection.candidates[0].variables).toEqual([
      { id: "headline", type: "string", role: "content", label: undefined },
      { id: "accent", type: "color", role: "style", label: undefined },
    ]);
  });

  it("ranks a block that declares string variables above one that does not", () => {
    const catalogWithBoth = catalog(
      [
        item({ name: "aaa-reveal", title: "Reveal", description: "product reveal", dimensions: PORTRAIT, duration: 6 }),
        item({ name: "zzz-reveal", title: "Reveal", description: "product reveal", dimensions: PORTRAIT, duration: 6 }),
      ],
      { "aaa-reveal": details("aaa-reveal", { variables: [{ id: "headline", type: "string", role: "content" }] }) },
    );

    const names = select({ catalog: catalogWithBoth }).candidates.map((candidate) => candidate.name);
    expect(names[0]).toBe("aaa-reveal");
  });

  it("caps the shortlist and reports the query it ran per beat", () => {
    const selection = select({ maxTotal: 1 });

    expect(selection.candidates).toHaveLength(1);
    expect(selection.queries.map((entry) => entry.beat)).toEqual(["hook", "message", "proof", "cta"]);
    for (const entry of selection.queries) expect(entry.query).toContain("product promo");
  });

  it("offers nothing when the catalog is empty", () => {
    const selection = select({ catalog: catalog([]) });

    expect(selection.candidates).toEqual([]);
    expect(selection.queries).toHaveLength(4);
  });

  it("lets a high-emphasis beat surface candidates a low-emphasis beat could not", () => {
    const items = ["aaa", "bbb", "ccc"].map((prefix) =>
      item({ name: `${prefix}-product-reveal`, title: "Product Reveal", description: "product reveal", dimensions: PORTRAIT, duration: 4 }),
    );

    const selection = select({ catalog: catalog(items), perBeatLimit: 1, maxTotal: 100 });

    // hook and message are high emphasis, so each returns three; proof and cta return one each.
    expect(selection.candidates.map((candidate) => candidate.name)).toEqual([
      "aaa-product-reveal",
      "bbb-product-reveal",
      "ccc-product-reveal",
    ]);
  });
});
