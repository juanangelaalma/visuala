import type { PricingPlan } from "@/domain/pricing/types";
import { PricingPlanManager } from "@/features/admin/pricing/components/PricingPlanManager";
import { apiFetch } from "@/lib/api/client";

export default async function AdminPricingPage() {
  const { plans } = await apiFetch<{ plans: PricingPlan[] }>("/admin/pricing-plans");

  return <PricingPlanManager plans={plans} />;
}
