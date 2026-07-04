import { listActivePricingPlans } from "@/application/pricing/list-active-pricing-plans";
import { SupabasePricingPlanRepository } from "@/infrastructure/pricing/supabase-pricing-plan-repository";
import { createSupabasePublicServerClient } from "@/infrastructure/supabase/public-server-client";

export async function GET() {
  try {
    const supabase = createSupabasePublicServerClient();
    const pricingPlanRepository = new SupabasePricingPlanRepository(supabase);
    const plans = await listActivePricingPlans(pricingPlanRepository);

    return Response.json(
      { plans },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return Response.json({ error: "Could not load pricing plans.", plans: [] }, { status: 500 });
  }
}
