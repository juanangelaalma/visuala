import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingPlanRepository, SavePricingPlanInput } from "@/domain/pricing/pricing-plan-repository";
import type { PricingPlan } from "@/domain/pricing/types";
import type { Database } from "@/infrastructure/supabase/database.types";

type PricingPlanInsert = Database["public"]["Tables"]["pricing_plans"]["Insert"];
type PricingPlanUpdate = Database["public"]["Tables"]["pricing_plans"]["Update"];

export class SupabasePricingPlanRepository implements PricingPlanRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findActiveById(id: string): Promise<PricingPlan | null> {
    const { data, error } = await this.supabase
      .from("pricing_plans")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return data ? mapPricingPlan(data) : null;
  }

  async listActive(): Promise<PricingPlan[]> {
    const { data, error } = await this.supabase
      .from("pricing_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return data.map(mapPricingPlan);
  }

  async listAll(): Promise<PricingPlan[]> {
    const { data, error } = await this.supabase.from("pricing_plans").select("*").order("sort_order", { ascending: true });

    if (error) throw error;
    return data.map(mapPricingPlan);
  }

  async create(input: SavePricingPlanInput): Promise<PricingPlan> {
    const { data, error } = await this.supabase.from("pricing_plans").insert(mapPricingPlanInput(input)).select("*").single();

    if (error) throw error;
    return mapPricingPlan(data);
  }

  async update(id: string, input: SavePricingPlanInput): Promise<PricingPlan> {
    const { data, error } = await this.supabase.from("pricing_plans").update(mapPricingPlanUpdate(input)).eq("id", id).select("*").single();

    if (error) throw error;
    return mapPricingPlan(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("pricing_plans").delete().eq("id", id);

    if (error) throw error;
  }
}

function mapPricingPlanInput(input: SavePricingPlanInput): PricingPlanInsert {
  return mapPricingPlanFields(input);
}

function mapPricingPlanUpdate(input: SavePricingPlanInput): PricingPlanUpdate {
  return mapPricingPlanFields(input);
}

function mapPricingPlanFields(input: SavePricingPlanInput) {
  return {
    slug: input.slug,
    name: input.name,
    price_amount: input.priceAmount,
    currency: input.currency,
    billing_period: input.billingPeriod,
    billing_label: input.billingLabel,
    compare_at_amount: input.compareAtAmount,
    badge_label: input.badgeLabel,
    cta_label: input.ctaLabel,
    credits: input.credits,
    bonus_credits: input.bonusCredits,
    credit_expires_in_days: input.creditExpiresInDays,
    features: input.features,
    is_active: input.isActive,
    is_most_popular: input.isMostPopular,
    sort_order: input.sortOrder,
  };
}

function mapPricingPlan(row: Database["public"]["Tables"]["pricing_plans"]["Row"]): PricingPlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceAmount: row.price_amount,
    currency: row.currency,
    billingPeriod: row.billing_period,
    billingLabel: row.billing_label,
    compareAtAmount: row.compare_at_amount,
    badgeLabel: row.badge_label,
    ctaLabel: row.cta_label,
    credits: row.credits,
    bonusCredits: row.bonus_credits,
    creditExpiresInDays: row.credit_expires_in_days,
    features: row.features,
    isActive: row.is_active,
    isMostPopular: row.is_most_popular,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
