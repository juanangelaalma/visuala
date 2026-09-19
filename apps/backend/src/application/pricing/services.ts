import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabasePricingPlanRepository } from "@/infrastructure/pricing/supabase-pricing-plan-repository";
import type { Database } from "@visuala/db";

export function createPricingServices(supabase: SupabaseClient<Database>) {
  return {
    pricingPlanRepository: new SupabasePricingPlanRepository(supabase),
  };
}
