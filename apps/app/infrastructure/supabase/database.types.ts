export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: "user" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "user" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "user" | "admin";
          updated_at?: string;
        };
        Relationships: [];
      };
      pricing_plans: {
        Row: {
          id: string;
          slug: string;
          name: string;
          price_amount: number;
          currency: string;
          credits: number;
          bonus_credits: number;
          credit_expires_in_days: number;
          features: string[];
          billing_period: "monthly" | "annually";
          billing_label: string;
          compare_at_amount: number | null;
          badge_label: string | null;
          cta_label: string;
          is_active: boolean;
          is_most_popular: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          price_amount: number;
          currency?: string;
          billing_period?: "monthly" | "annually";
          billing_label?: string;
          compare_at_amount?: number | null;
          badge_label?: string | null;
          cta_label?: string;
          credits: number;
          bonus_credits?: number;
          credit_expires_in_days: number;
          features?: string[];
          is_active?: boolean;
          is_most_popular?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          price_amount?: number;
          currency?: string;
          billing_period?: "monthly" | "annually";
          billing_label?: string;
          compare_at_amount?: number | null;
          badge_label?: string | null;
          cta_label?: string;
          credits?: number;
          bonus_credits?: number;
          credit_expires_in_days?: number;
          features?: string[];
          is_active?: boolean;
          is_most_popular?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_payment_methods: { Row: { id: string; slug: string; kind: "qris" | "virtual_account" | "ewallet"; label: string; description: string | null; logo_url: string | null; currency: "IDR"; min_amount: number | null; max_amount: number | null; enabled: boolean; launch_phase: number; sort_order: number; created_at: string; updated_at: string }; Insert: Partial<Database["public"]["Tables"]["billing_payment_methods"]["Row"]> & { slug: string; kind: "qris" | "virtual_account" | "ewallet"; label: string; launch_phase: number }; Update: Partial<Database["public"]["Tables"]["billing_payment_methods"]["Row"]>; Relationships: [] };
      billing_payments: { Row: { id: string; user_id: string; pricing_plan_id: string; selected_payment_method_id: string; idempotency_key: string; status: "pending" | "requires_action" | "paid" | "failed" | "expired" | "cancelled"; price_amount: number; currency: "IDR"; base_credits: number; bonus_credits: number; credit_expires_in_days: number; expires_at: string | null; paid_at: string | null; settlement_audit_code: string | null; created_at: string; updated_at: string }; Insert: { id?: string; user_id: string; pricing_plan_id: string; selected_payment_method_id: string; idempotency_key: string; status?: "pending" | "requires_action" | "paid" | "failed" | "expired" | "cancelled"; price_amount: number; currency: "IDR"; base_credits: number; bonus_credits: number; credit_expires_in_days: number; expires_at?: string | null; paid_at?: string | null; settlement_audit_code?: string | null; created_at?: string; updated_at?: string }; Update: Partial<Database["public"]["Tables"]["billing_payments"]["Row"]>; Relationships: [] };
      billing_provider_attempts: { Row: { id: string; billing_payment_id: string; payment_method_id: string; provider_mapping_id: string; attempt_number: number; provider: string; environment: "test" | "production"; mapping_version: number; provider_method_type: string; provider_channel_code: string; mapping_config: unknown; provider_reference: string; provider_idempotency_key: string; provider_payment_id: string | null; status: "creating" | "unknown" | "requires_action" | "pending" | "failed" | "expired" | "paid"; actions: unknown; raw_provider_status: string | null; failure_category: string | null; expires_at: string | null; last_reconciled_at: string | null; completed_at: string | null; created_at: string; updated_at: string }; Insert: Partial<Database["public"]["Tables"]["billing_provider_attempts"]["Row"]> & { billing_payment_id: string; payment_method_id: string; provider_mapping_id: string; attempt_number: number; provider: string; environment: "test" | "production"; mapping_version: number; provider_method_type: string; provider_channel_code: string; provider_reference: string; provider_idempotency_key: string }; Update: Partial<Database["public"]["Tables"]["billing_provider_attempts"]["Row"]>; Relationships: [] };
      billing_webhook_events: { Row: { id: string; provider: string; environment: "test" | "production"; deduplication_key: string; event_type: string; normalized_status: string; provider_reference: string; provider_payment_id: string; amount: number; currency: "IDR"; occurred_at: string; status: "received" | "processed" | "failed"; attempt_count: number; last_error_sanitized: string | null; outcome_code: string | null; received_at: string; processed_at: string | null; failed_at: string | null; next_attempt_at: string | null; dead_lettered_at: string | null }; Insert: Partial<Database["public"]["Tables"]["billing_webhook_events"]["Row"]>; Update: Partial<Database["public"]["Tables"]["billing_webhook_events"]["Row"]>; Relationships: [] };
      credit_wallets: { Row: { user_id: string; balance: number; created_at: string; updated_at: string }; Insert: { user_id: string; balance?: number; created_at?: string; updated_at?: string }; Update: Partial<Database["public"]["Tables"]["credit_wallets"]["Row"]>; Relationships: [] };
      credit_grants: { Row: { id: string; user_id: string; billing_payment_id: string; pricing_plan_id: string; amount: number; remaining_amount: number; granted_at: string; expires_at: string; created_at: string }; Insert: Partial<Database["public"]["Tables"]["credit_grants"]["Row"]>; Update: Partial<Database["public"]["Tables"]["credit_grants"]["Row"]>; Relationships: [] };
      credit_ledger_entries: { Row: { id: string; user_id: string; billing_payment_id: string | null; credit_grant_id: string | null; entry_type: "purchase_grant" | "spend" | "expiration" | "adjustment" | "reversal"; amount: number; balance_after: number; idempotency_key: string; created_at: string }; Insert: Partial<Database["public"]["Tables"]["credit_ledger_entries"]["Row"]>; Update: Partial<Database["public"]["Tables"]["credit_ledger_entries"]["Row"]>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      allocate_billing_provider_attempt: { Args: { p_billing_payment_id: string; p_provider: string; p_environment: string; p_provider_reference: string; p_provider_idempotency_key: string }; Returns: Database["public"]["Tables"]["billing_provider_attempts"]["Row"] };
      receive_billing_webhook: { Args: { p_provider: string; p_environment: string; p_deduplication_key: string; p_event_type: string; p_normalized_status: string; p_provider_reference: string; p_provider_payment_id: string; p_amount: number; p_currency: string; p_occurred_at: string }; Returns: string };
      fulfill_billing_webhook: { Args: { p_event_id: string; p_max_attempts?: number; p_verified_failed_settlement?: boolean }; Returns: import("@/domain/billing/types").WebhookFulfillmentOutcome };
      record_billing_webhook_failure: { Args: { p_event_id: string; p_error_sanitized: string; p_max_attempts?: number; p_base_delay_seconds?: number; p_max_delay_seconds?: number }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
