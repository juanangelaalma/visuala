import { listPricingPlans } from "@/application/pricing/list-pricing-plans";
import { createPricingServices } from "@/application/pricing/services";
import { PricingPlanManager } from "@/features/admin/pricing/components/PricingPlanManager";

export default async function AdminPricingPage() {
  const { pricingPlanRepository } = await createPricingServices();
  const plans = await listPricingPlans(pricingPlanRepository);

  return <PricingPlanManager plans={plans} />;
}
