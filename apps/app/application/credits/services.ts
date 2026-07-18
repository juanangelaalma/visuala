import { SupabaseCreditRepository } from "@/infrastructure/credits/supabase-credit-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

export async function createCreditServices() {
  const supabase = await createSupabaseServerClient();
  return { creditRepository: new SupabaseCreditRepository(supabase) };
}
