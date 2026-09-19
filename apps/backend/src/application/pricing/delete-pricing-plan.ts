import type { PricingPlanRepository } from "@/domain/pricing/pricing-plan-repository";

export async function deletePricingPlan(repository: PricingPlanRepository, id: string): Promise<void> {
  await repository.delete(id);
}
