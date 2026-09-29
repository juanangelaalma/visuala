import type { VideoBrief } from "../../domain/video/brief";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";

/**
 * The brief as the engine reads it: only what a composition is allowed to quote, so a validator can
 * never be handed a field it would have to guess at.
 */
export function toValidationBrief(brief: VideoBrief): ValidationBrief {
  return {
    productName: brief.productName,
    brandName: brief.brandName,
    keyMessage: brief.keyMessage,
    callToAction: brief.callToAction,
    orderDestination: brief.orderDestination,
    audience: brief.audience,
    objective: brief.objective,
    productCategory: brief.productCategory,
    offer: brief.offer,
    menuItems: brief.menuItems,
  };
}
