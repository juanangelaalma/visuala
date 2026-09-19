import type { PricingPlanRepository } from "@/domain/pricing/pricing-plan-repository";
import type { PricingPlan } from "@/domain/pricing/types";

export async function listPricingPlans(repository: PricingPlanRepository): Promise<PricingPlan[]> {
  return repository.listAll();
}
