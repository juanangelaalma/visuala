import type { PricingPlanRepository, SavePricingPlanInput } from "@/domain/pricing/pricing-plan-repository";
import type { PricingPlan } from "@/domain/pricing/types";

export async function createPricingPlan(repository: PricingPlanRepository, input: SavePricingPlanInput): Promise<PricingPlan> {
  return repository.create(input);
}
