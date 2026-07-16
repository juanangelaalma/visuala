import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditRepository } from "@/domain/credits/contracts";
import type { CreditGrant, CreditLedgerEntry, CreditWallet } from "@/domain/credits/types";
import type { Database } from "@/infrastructure/supabase/database.types";

export class SupabaseCreditRepository implements CreditRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findWalletByOwner(userId: string): Promise<CreditWallet | null> {
    const { data, error } = await this.supabase.from("credit_wallets").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? { userId: data.user_id, balance: data.balance, createdAt: data.created_at, updatedAt: data.updated_at } : null;
  }

  async listOwnedGrants(userId: string): Promise<CreditGrant[]> {
    const { data, error } = await this.supabase.from("credit_grants").select("*").eq("user_id", userId).order("granted_at", { ascending: false });
    if (error) throw error;
    return data.map((row) => ({ id: row.id, userId: row.user_id, billingPaymentId: row.billing_payment_id, pricingPlanId: row.pricing_plan_id, amount: row.amount, remainingAmount: row.remaining_amount, grantedAt: row.granted_at, expiresAt: row.expires_at }));
  }

  async listOwnedLedgerEntries(userId: string): Promise<CreditLedgerEntry[]> {
    const { data, error } = await this.supabase.from("credit_ledger_entries").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((row) => ({ id: row.id, userId: row.user_id, billingPaymentId: row.billing_payment_id, creditGrantId: row.credit_grant_id, entryType: row.entry_type, amount: row.amount, balanceAfter: row.balance_after, idempotencyKey: row.idempotency_key, createdAt: row.created_at }));
  }
}
