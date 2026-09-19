import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseCreditRepository } from "@/infrastructure/credits/supabase-credit-repository";
import type { Database } from "@visuala/db";

export function createCreditServices(supabase: SupabaseClient<Database>) {
  return {
    creditRepository: new SupabaseCreditRepository(supabase),
  };
}
