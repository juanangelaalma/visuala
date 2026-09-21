import { z } from "zod";
import { VIDEO_STYLE_IDS, outputSettingsSchema } from "./settings";
import type { VideoType } from "./types";

export const BRIEF_SCHEMA_NAME = "video_brief";
export const BRIEF_SCHEMA_VERSION = "v1";

const CONFIRMING_SOURCES = ["user_message", "user_confirmation"] as const;

export const videoBriefSchema = z.object({
  productName: z.string().trim().min(1),
  productCategory: z.string().trim().min(1).nullable(),
  audience: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  keyMessage: z.string().trim().min(1),
  offer: z.object({ label: z.string().trim().min(1), detail: z.string().trim().min(1) }).strict().nullable(),
  callToAction: z.string().trim().min(1).nullable(),
  orderDestination: z.string().trim().min(1).nullable(),
  brandName: z.string().trim().min(1).nullable(),
  styleId: z.enum(VIDEO_STYLE_IDS),
  outputSettings: outputSettingsSchema,
  menuItems: z.array(z.object({ name: z.string().trim().min(1), price: z.string().trim().min(1).nullable() }).strict()).nullable(),
  facts: z.array(z.object({ field: z.string().trim().min(1), value: z.string().trim().min(1), source: z.enum(["user_message", "user_confirmation", "asset_analysis"]) }).strict()),
}).strict();

export type VideoBrief = z.infer<typeof videoBriefSchema>;

export type BriefField = "productName" | "audience" | "objective" | "keyMessage" | "offer" | "callToAction" | "menuItems";

const BASE_REQUIRED_FIELDS: readonly BriefField[] = ["productName", "audience", "objective", "keyMessage"];

/** What the interviewer must collect before approval, per video type. */
export const REQUIRED_BRIEF_FIELDS: Record<VideoType, readonly BriefField[]> = {
  product_promo: [...BASE_REQUIRED_FIELDS, "callToAction"],
  discount_promo: [...BASE_REQUIRED_FIELDS, "offer"],
  product_launch: [...BASE_REQUIRED_FIELDS, "callToAction"],
  menu_showcase: [...BASE_REQUIRED_FIELDS, "menuItems"],
};

export function findMissingBriefFields(brief: VideoBrief, videoType: VideoType): readonly BriefField[] {
  return REQUIRED_BRIEF_FIELDS[videoType].filter((field) => !isSatisfied(brief, field));
}

/** Official minimum for a menu showcase: two named items. */
const MIN_MENU_ITEMS = 2;

function isSatisfied(brief: VideoBrief, field: BriefField): boolean {
  if (field === "menuItems") return (brief.menuItems?.length ?? 0) >= MIN_MENU_ITEMS;
  return brief[field] !== null;
}

/**
 * Commercial fields must be traceable to something the user said or confirmed. A value the vision
 * model read off a package is not a confirmation, so `asset_analysis` never clears a commercial field.
 */
export function findUnsupportedCommercialFacts(brief: VideoBrief): readonly string[] {
  const confirmed = new Set(
    brief.facts.filter((fact) => (CONFIRMING_SOURCES as readonly string[]).includes(fact.source)).map((fact) => `${fact.field}=${fact.value}`),
  );
  return commercialFactValues(brief).filter((fact) => !confirmed.has(`${fact.field}=${fact.value}`)).map((fact) => fact.field);
}

export function commercialFactValues(brief: VideoBrief): readonly { field: string; value: string }[] {
  const values: { field: string; value: string }[] = [];
  if (brief.offer) {
    values.push({ field: "offer.label", value: brief.offer.label });
    values.push({ field: "offer.detail", value: brief.offer.detail });
  }
  if (brief.orderDestination) values.push({ field: "orderDestination", value: brief.orderDestination });
  (brief.menuItems ?? []).forEach((item, index) => {
    if (item.price) values.push({ field: `menuItems[${index}].price`, value: item.price });
  });
  return values;
}
