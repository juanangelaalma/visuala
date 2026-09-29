import type { BriefField } from "../video/brief";
import type { ValidationBrief } from "./validators/types";

const MIN_ALLOWED_LENGTH = 2;

/** Everything a composition is allowed to quote, normalised for comparison. */
export function briefValues(brief: ValidationBrief): string[] {
  const values = [
    brief.productName,
    brief.brandName,
    brief.keyMessage,
    brief.callToAction,
    brief.orderDestination,
    brief.audience,
    brief.objective,
    brief.productCategory,
    brief.offer?.label,
    brief.offer?.detail,
  ].filter((value): value is string => typeof value === "string");

  for (const item of brief.menuItems ?? []) {
    values.push(item.name);
    if (item.price) values.push(item.price);
  }
  return values.map(normalize).filter((value) => value.length >= MIN_ALLOWED_LENGTH);
}

/** What is left of `value` after every brief value is removed; empty means fully traceable. */
export function residual(value: string, allowed: readonly string[]): string {
  let remainder = normalize(value);
  for (const candidate of [...allowed].sort((left, right) => right.length - left.length)) {
    remainder = remainder.split(candidate).join(" ");
  }
  return remainder.replace(/[^\p{L}\p{N}]+/gu, "");
}

export function isBriefFieldSatisfied(brief: ValidationBrief, field: BriefField): boolean {
  if (field === "menuItems") return (brief.menuItems?.length ?? 0) >= 2;
  if (field === "offer") return brief.offer !== null;
  const value = brief[field];
  return typeof value === "string" && value.trim().length > 0;
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
