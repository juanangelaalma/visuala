import { describe, expect, it } from "vitest";
import { CatalogError, buildCatalog, parseCatalogDetails, parseCatalogRows } from "./catalog";
import type { Catalog, CatalogItem, CatalogItemDetails } from "./catalog";
import { catalogItemExists, findCatalogItem, inspectCatalogItem, searchCatalog } from "./catalog-search";

function item(overrides: Partial<CatalogItem> & { name: string }): CatalogItem {
  return { type: "block", title: overrides.name, description: "", tags: [], ...overrides };
}

function details(name: string, extra: Partial<CatalogItemDetails> = {}): CatalogItemDetails {
  return {
    name,
    type: "block",
    tags: [],
    files: [],
    registryDependencies: [],
    variables: [],
    ...extra,
  };
}

function catalog(items: CatalogItem[], detailMap: Record<string, CatalogItemDetails> = {}): Catalog {
  return buildCatalog(items, new Map(Object.entries(detailMap)));
}

const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };

describe("searchCatalog", () => {
  it("ranks a name match above a description match", () => {
    const result = searchCatalog(
      catalog([
        item({ name: "panel-reveal", description: "A panel reveal primitive" }),
        item({ name: "unrelated", description: "nothing to see" }),
        item({ name: "product-reveal", title: "Product Reveal", description: "reveals a product" }),
      ]),
      "product reveal",
    );

    expect(result[0]?.name).toBe("product-reveal");
    expect(result.map((entry) => entry.name)).not.toContain("unrelated");
  });

  it("keeps only items authored at the requested aspect ratio", () => {
    const result = searchCatalog(
      catalog([
        item({ name: "portrait-reveal", title: "Portrait Reveal", dimensions: PORTRAIT }),
        item({ name: "landscape-reveal", title: "Landscape Reveal", dimensions: LANDSCAPE }),
        item({ name: "unshaped-reveal", title: "Unshaped Reveal" }),
      ]),
      "reveal",
      { aspectRatio: "9:16" },
    );

    expect(result.map((entry) => entry.name).sort()).toEqual(["portrait-reveal", "unshaped-reveal"]);
  });

  it("filters by type and honours the limit", () => {
    const result = searchCatalog(
      catalog([
        item({ name: "a-reveal", tags: ["reveal"] }),
        item({ name: "b-reveal", tags: ["reveal"] }),
        item({ name: "c-reveal", tags: ["reveal"], type: "component" }),
      ]),
      "reveal",
      { type: "block", limit: 1 },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("block");
  });

  it("is deterministic for the same query", () => {
    const subject = catalog([item({ name: "alpha-reveal", tags: ["reveal"] }), item({ name: "beta-reveal", tags: ["reveal"] })]);

    expect(searchCatalog(subject, "reveal")).toEqual(searchCatalog(subject, "reveal"));
  });

  it("returns nothing for a query with no searchable token", () => {
    expect(searchCatalog(catalog([item({ name: "alpha" })]), "a")).toEqual([]);
  });

  it("breaks a score tie by name", () => {
    const result = searchCatalog(catalog([item({ name: "zeta-reveal", tags: ["reveal"] }), item({ name: "alpha-reveal", tags: ["reveal"] })]), "reveal");

    expect(result.map((entry) => entry.name)).toEqual(["alpha-reveal", "zeta-reveal"]);
  });
});

describe("inspection helpers", () => {
  it("returns details for a known item and null otherwise", () => {
    const subject = catalog([item({ name: "known" })], { known: details("known", { variables: [{ id: "title", type: "string" }] }) });

    expect(inspectCatalogItem(subject, "known")?.variables).toHaveLength(1);
    expect(inspectCatalogItem(subject, "unknown")).toBeNull();
  });

  it("reports availability from the discovery rows", () => {
    const subject = catalog([item({ name: "known" })]);

    expect(catalogItemExists(subject, "known")).toBe(true);
    expect(catalogItemExists(subject, "unknown")).toBe(false);
    expect(findCatalogItem(subject, "unknown")).toBeNull();
  });
});

describe("catalog parsing", () => {
  it("parses the committed catalog and finds a real portrait block", async () => {
    const { createFsCatalogSource } = await import("../../infrastructure/video-engine/fs-catalog-source");
    const subject = await createFsCatalogSource(process.cwd()).load();

    expect(subject.items.length).toBeGreaterThan(100);
    expect(subject.details.size).toBeGreaterThan(100);

    const promo = inspectCatalogItem(subject, "heygen-avatar-promo-card");
    expect(promo?.dimensions).toEqual({ width: 1080, height: 1920 });
    expect(promo?.variables.length).toBeGreaterThan(3);

    const portrait = searchCatalog(subject, "promo card offer", { aspectRatio: "9:16", limit: 5 });
    expect(portrait.length).toBeGreaterThan(0);
    const shaped = portrait.filter((entry) => entry.dimensions !== undefined);
    expect(shaped.length).toBeGreaterThan(0);
    for (const entry of shaped) {
      expect(Math.abs(entry.dimensions!.width / entry.dimensions!.height - 9 / 16)).toBeLessThan(0.02);
    }
  });

  it("rejects rows that are not a catalog", () => {
    expect(() => parseCatalogRows({ items: [{ name: "x" }] })).toThrow(CatalogError);
  });

  it("rejects a details file whose items are not objects", () => {
    expect(() => parseCatalogDetails({ cliVersion: "v", registryUrl: "u", items: { x: 1 } })).toThrow(CatalogError);
  });
});
