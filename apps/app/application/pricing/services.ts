import { SupabasePricingPlanRepository } from "@/infrastructure/pricing/supabase-pricing-plan-repository";
import { createSupabaseServerClient, createSupabaseWritableServerClient } from "@/infrastructure/supabase/server-client";

export async function createPricingServices({ writable = false }: { writable?: boolean } = {}) {
  const supabase = writable ? await createSupabaseWritableServerClient() : await createSupabaseServerClient();

  return {
    pricingPlanRepository: new SupabasePricingPlanRepository(supabase),
  };
}
