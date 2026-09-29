import { z } from "zod";

export const CATALOG_DETAILS_SCHEMA_VERSION = "catalog-details@v1";
/** The catalog is only valid for the renderer it was generated against. */
export const CATALOG_CLI_VERSION = "hyperframes@0.8.59";

export type CatalogErrorCode = "catalog_invalid" | "catalog_missing";

export class CatalogError extends Error {
  constructor(readonly code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

const dimensionsSchema = z.object({ width: z.number().positive(), height: z.number().positive() }).strict();

const previewSchema = z.object({ video: z.string().optional(), poster: z.string().optional() }).strict();

export const catalogItemSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(["block", "component"]),
    title: z.string().trim().min(1),
    description: z.string(),
    tags: z.array(z.string()),
    dimensions: dimensionsSchema.optional(),
    duration: z.number().positive().optional(),
    preview: previewSchema.optional(),
  })
  .strict();

export const catalogVariableSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.string().trim().min(1),
    role: z.string().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    maxLength: z.number().int().positive().optional(),
  })
  .loose();

export const catalogItemDetailsSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(["block", "component"]),
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()),
    author: z.string().optional(),
    dimensions: dimensionsSchema.optional(),
    duration: z.number().positive().optional(),
    files: z.array(z.string()),
    registryDependencies: z.array(z.string()),
    variables: z.array(catalogVariableSchema),
  })
  .strict();

export const catalogRowsSchema = z.object({ items: z.array(catalogItemSchema) }).strict();
export const catalogDetailsFileSchema = z
  .object({
    cliVersion: z.string(),
    registryUrl: z.string(),
    items: z.record(z.string(), catalogItemDetailsSchema),
  })
  .strict();

export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogVariable = z.infer<typeof catalogVariableSchema>;
export type CatalogItemDetails = z.infer<typeof catalogItemDetailsSchema>;

/** Discovery rows plus whatever inspection data was generated for them. */
export type Catalog = {
  items: readonly CatalogItem[];
  details: ReadonlyMap<string, CatalogItemDetails>;
};

export function parseCatalogRows(value: unknown): CatalogItem[] {
  const parsed = catalogRowsSchema.safeParse(value);
  if (!parsed.success) throw invalid("The catalog rows are not valid.");
  return parsed.data.items;
}

export function parseCatalogDetails(value: unknown): Map<string, CatalogItemDetails> {
  const parsed = catalogDetailsFileSchema.safeParse(value);
  if (!parsed.success) throw invalid("The catalog details are not valid.");
  return new Map(Object.entries(parsed.data.items));
}

export function buildCatalog(items: readonly CatalogItem[], details: ReadonlyMap<string, CatalogItemDetails>): Catalog {
  return { items, details };
}

/** The frames a catalog item was authored at, as a width/height ratio; null when it declares none. */
export function catalogItemAspectRatio(item: Pick<CatalogItem, "dimensions">): number | null {
  if (!item.dimensions) return null;
  return item.dimensions.width / item.dimensions.height;
}

export const ASPECT_RATIO_VALUES: Readonly<Record<string, number>> = Object.freeze({
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1:1": 1,
});

function invalid(message: string): CatalogError {
  return new CatalogError("catalog_invalid", message);
}
