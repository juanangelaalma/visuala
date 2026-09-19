import type { PricingPlanRepository, SavePricingPlanInput } from "@/domain/pricing/pricing-plan-repository";
import type { PricingPlan } from "@/domain/pricing/types";

export async function updatePricingPlan(repository: PricingPlanRepository, id: string, input: SavePricingPlanInput): Promise<PricingPlan> {
  return repository.update(id, input);
}
