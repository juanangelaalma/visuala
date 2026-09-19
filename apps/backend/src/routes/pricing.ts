import { Elysia } from "elysia";
import { listActivePricingPlans } from "@/application/pricing/list-active-pricing-plans";
import { createPricingServices } from "@/application/pricing/services";
import { createSupabasePublicClient } from "@/infrastructure/supabase/clients";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

export const pricingRoutes = new Elysia({ name: "pricing-routes" }).get(
  "/pricing-plans",
  async ({ set }) => {
    try {
      const { pricingPlanRepository } = createPricingServices(createSupabasePublicClient());
      const plans = await listActivePricingPlans(pricingPlanRepository);

      set.headers["cache-control"] = CACHE_CONTROL;
      return { plans };
    } catch {
      set.status = 500;
      return { error: "Could not load pricing plans.", plans: [] };
    }
  },
  { detail: { tags: ["pricing"] } },
);
