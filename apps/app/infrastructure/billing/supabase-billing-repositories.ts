import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingPaymentRepository, CreateBillingPaymentInput, PaymentCatalogRepository, ProviderAttemptRepository, TrustedProviderAllocation } from "@/domain/billing/contracts";
import type { BillingPayment, BillingPaymentProjection, CheckoutAction, PaymentMethod, ProviderAttempt } from "@/domain/billing/types";
import type { Database } from "@/infrastructure/supabase/database.types";

type Tables = Database["public"]["Tables"];
type PaymentRow = Tables["billing_payments"]["Row"];
type MethodRow = Tables["billing_payment_methods"]["Row"];
type AttemptRow = Tables["billing_provider_attempts"]["Row"];

export class SupabasePaymentCatalogRepository implements PaymentCatalogRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listEnabled(): Promise<PaymentMethod[]> {
    const { data, error } = await this.supabase.from("billing_payment_methods").select("*").eq("enabled", true).eq("launch_phase", 1).order("sort_order");
    console.log(data)
    if (error) throw error;
    return data.map(mapPaymentMethod);
  }

  async findEnabledById(id: string, amount: number, currency: "IDR"): Promise<PaymentMethod | null> {
    const { data, error } = await this.supabase.from("billing_payment_methods").select("*").eq("id", id).eq("enabled", true).eq("launch_phase", 1).eq("currency", currency).or(`min_amount.is.null,min_amount.lte.${amount}`).or(`max_amount.is.null,max_amount.gte.${amount}`).maybeSingle();
    if (error) throw error;
    return data ? mapPaymentMethod(data) : null;
  }
}

export class SupabaseBillingPaymentRepository implements BillingPaymentRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async createIdempotently(input: CreateBillingPaymentInput): Promise<{ payment: BillingPayment; created: boolean }> {
    const insert: Tables["billing_payments"]["Insert"] = { user_id: input.userId, pricing_plan_id: input.pricingPlanId, selected_payment_method_id: input.selectedPaymentMethodId, idempotency_key: input.idempotencyKey, price_amount: input.priceAmount, currency: input.currency, base_credits: input.baseCredits, bonus_credits: input.bonusCredits, credit_expires_in_days: input.creditExpiresInDays };
    const result = await this.supabase.from("billing_payments").insert(insert).select("*").maybeSingle();
    if (!result.error && result.data) return { payment: mapPayment(result.data), created: true };
    if (result.error?.code !== "23505") throw result.error;
    const existing = await this.supabase.from("billing_payments").select("*").eq("user_id", input.userId).eq("idempotency_key", input.idempotencyKey).single();
    if (existing.error) throw existing.error;
    return { payment: mapPayment(existing.data), created: false };
  }

  async findOwnedProjection(id: string, userId: string): Promise<BillingPaymentProjection | null> {
    const paymentResult = await this.supabase.from("billing_payments").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (paymentResult.error) throw paymentResult.error;
    if (!paymentResult.data) return null;
    const [methodResult, attemptResult] = await Promise.all([
      this.supabase.from("billing_payment_methods").select("*").eq("id", paymentResult.data.selected_payment_method_id).single(),
      this.supabase.from("billing_provider_attempts").select("*, billing_payments!inner(user_id)").eq("billing_payment_id", id).eq("billing_payments.user_id", userId).order("attempt_number", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (methodResult.error) throw methodResult.error;
    if (attemptResult.error) throw attemptResult.error;
    return { ...mapPayment(paymentResult.data), paymentMethod: mapPaymentMethod(methodResult.data), latestAttempt: attemptResult.data ? mapAttempt(attemptResult.data as AttemptRow) : null };
  }
}

export class SupabaseProviderAttemptRepository implements ProviderAttemptRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async allocate(input: { billingPaymentId: string } & TrustedProviderAllocation): Promise<ProviderAttempt> {
    const { data, error } = await this.supabase.rpc("allocate_billing_provider_attempt", { p_billing_payment_id: input.billingPaymentId, p_provider: input.provider, p_environment: input.environment, p_provider_reference: input.providerReference, p_provider_idempotency_key: input.providerIdempotencyKey });
    if (error) throw error;
    return mapAttempt(data);
  }

  async markUnknown(attemptId: string): Promise<void> {
    const { error } = await this.supabase.from("billing_provider_attempts").update({ status: "unknown" }).eq("id", attemptId);
    if (error) throw error;
  }

  async saveProviderResult(attemptId: string, result: { providerPaymentId: string; status: ProviderAttempt["status"]; actions: ProviderAttempt["actions"]; expiresAt: string | null }): Promise<ProviderAttempt> {
    const { data, error } = await this.supabase.from("billing_provider_attempts").update({ provider_payment_id: result.providerPaymentId, status: result.status, actions: result.actions, expires_at: result.expiresAt }).eq("id", attemptId).select("*").single();
    if (error) throw error;
    return mapAttempt(data);
  }
}

export function mapPaymentMethod(row: MethodRow): PaymentMethod { return { id: row.id, slug: row.slug, kind: row.kind, label: row.label, description: row.description, logoUrl: row.logo_url, currency: row.currency, minAmount: row.min_amount, maxAmount: row.max_amount, enabled: row.enabled, launchPhase: row.launch_phase, sortOrder: row.sort_order }; }
export function mapPayment(row: PaymentRow): BillingPayment { return { id: row.id, userId: row.user_id, pricingPlanId: row.pricing_plan_id, selectedPaymentMethodId: row.selected_payment_method_id, idempotencyKey: row.idempotency_key, status: row.status, priceAmount: row.price_amount, currency: row.currency, baseCredits: row.base_credits, bonusCredits: row.bonus_credits, creditExpiresInDays: row.credit_expires_in_days, expiresAt: row.expires_at, paidAt: row.paid_at, settlementAuditCode: row.settlement_audit_code, createdAt: row.created_at, updatedAt: row.updated_at }; }
export function mapAttempt(row: AttemptRow): ProviderAttempt { return { id: row.id, billingPaymentId: row.billing_payment_id, paymentMethodId: row.payment_method_id, provider: row.provider, environment: row.environment, providerMethodType: row.provider_method_type, providerChannelCode: row.provider_channel_code, mappingConfig: row.mapping_config, providerReference: row.provider_reference, providerIdempotencyKey: row.provider_idempotency_key, providerPaymentId: row.provider_payment_id, status: row.status, actions: row.actions as CheckoutAction[], expiresAt: row.expires_at }; }
