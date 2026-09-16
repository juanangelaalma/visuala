export type Database = {
  public: {
    Tables: {
      ai_assets: {
        Row: { id: string; user_id: string; object_key: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; byte_size: number; sha256: string; width: number; height: number; validated: boolean; deleted_at: string | null; created_at: string };
        Insert: { id?: string; user_id: string; object_key: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; byte_size: number; sha256: string; width: number; height: number; validated?: boolean; deleted_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["ai_assets"]["Row"]>;
        Relationships: [];
      };
      ai_service_operations: {
        Row: { request_id: string; task: "connection_test" | "interviewer" | "planner" | "product_analysis"; user_id: string; project_id: string | null; prompt_version: string; schema_name: string | null; schema_version: string | null; profile_id: string; provider: string; model: string; status: "started" | "succeeded" | "failed"; latency_ms: number | null; attempt_count: number | null; finish_reason: string | null; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; estimated_cost: number | null; cost_currency: string | null; pricing_version: string | null; pricing_source: string | null; cost_complete: boolean; error_code: string | null; diagnostic_sanitized: string | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: Partial<Database["public"]["Tables"]["ai_service_operations"]["Row"]> & { request_id: string; task: "connection_test" | "interviewer" | "planner" | "product_analysis"; user_id: string; prompt_version: string; profile_id: string; provider: string; model: string; status: "started" | "succeeded" | "failed" };
        Update: Partial<Database["public"]["Tables"]["ai_service_operations"]["Row"]>;
        Relationships: [];
      };
      ai_service_attempts: {
        Row: { attempt_id: string; request_id: string; attempt_number: number; profile_id: string; provider: string; model: string; status: "started" | "succeeded" | "failed"; provider_request_id: string | null; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; dispatch_outcome: "not_sent" | "rejected" | "ambiguous"; usage_unknown: boolean; billing_unknown: boolean; estimated_cost: number | null; cost_currency: string | null; pricing_version: string | null; pricing_source: string | null; cost_complete: boolean; error_code: string | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: Partial<Database["public"]["Tables"]["ai_service_attempts"]["Row"]> & { attempt_id: string; request_id: string; attempt_number: number; profile_id: string; provider: string; model: string; status: "started" | "succeeded" | "failed" };
        Update: Partial<Database["public"]["Tables"]["ai_service_attempts"]["Row"]>;
        Relationships: [{ foreignKeyName: "ai_service_attempts_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "ai_service_operations"; referencedColumns: ["request_id"] }];
      };
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
      creative_projects: { Row: { id: string; user_id: string; create_idempotency_key: string; category_plugin_id: string; category_plugin_version: string; state: import("@/domain/creative-video/types").CreativeProjectState; revision: number; asset_id: string; active_concept_id: string | null; active_composition_version_id: string | null; failed_stage: import("@/domain/creative-video/types").CreativeFailedStage | null; error_code: string | null; preview_generation_count: number; preview_quota: number; created_at: string; updated_at: string }; Insert: Database["public"]["Tables"]["creative_projects"]["Row"]; Update: Partial<Database["public"]["Tables"]["creative_projects"]["Row"]>; Relationships: [] };
      creative_messages: { Row: { id: string; project_id: string; project_owner_id: string; role: import("@/domain/creative-video/types").ConversationMessageRole; kind: import("@/domain/creative-video/types").ConversationMessageKind; text: string; asset_id: string | null; project_revision: number; idempotency_key: string; created_at: string }; Insert: Omit<Database["public"]["Tables"]["creative_messages"]["Row"], "project_owner_id"> & { project_owner_id?: string }; Update: never; Relationships: [] };
      creative_brief_snapshots: { Row: { id: string; project_id: string; goal: string; product: string; facts: unknown; assumptions: unknown; missing_required_questions: unknown; optional_questions: unknown; asset_ids: unknown; plugin_schema_version: string; source_project_revision: number; created_at: string }; Insert: Database["public"]["Tables"]["creative_brief_snapshots"]["Row"]; Update: never; Relationships: [] };
      creative_concept_sets: { Row: { id: string; project_id: string; brief_snapshot_id: string; request_id: string; prompt_version: string; model: string; created_at: string }; Insert: Database["public"]["Tables"]["creative_concept_sets"]["Row"]; Update: never; Relationships: [] };
      creative_concepts: { Row: { id: string; project_id: string; concept_set_id: string; brief_snapshot_id: string; title: string; hook: string; angle: string; scene_outline: unknown; fit_reason: string; recommendation_reason: string; recommended: boolean; sort_order: number; generation_request_id: string; generation_prompt_version: string; generation_model: string; created_at: string }; Insert: Database["public"]["Tables"]["creative_concepts"]["Row"]; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      allocate_billing_provider_attempt: { Args: { p_billing_payment_id: string; p_provider: string; p_environment: string; p_provider_reference: string; p_provider_idempotency_key: string }; Returns: Database["public"]["Tables"]["billing_provider_attempts"]["Row"] };
      receive_billing_webhook: { Args: { p_provider: string; p_environment: string; p_deduplication_key: string; p_event_type: string; p_normalized_status: string; p_provider_reference: string; p_provider_payment_id: string; p_amount: number; p_currency: string; p_occurred_at: string }; Returns: string };
      fulfill_billing_webhook: { Args: { p_event_id: string; p_max_attempts?: number; p_verified_failed_settlement?: boolean }; Returns: import("@/domain/billing/types").WebhookFulfillmentOutcome };
      record_billing_webhook_failure: { Args: { p_event_id: string; p_error_sanitized: string; p_max_attempts?: number; p_base_delay_seconds?: number; p_max_delay_seconds?: number }; Returns: boolean };
      transition_owned_creative_project: { Args: { p_project_id: string; p_user_id: string; p_expected_revision: number; p_next_state: import("@/domain/creative-video/types").CreativeProjectState; p_patch: Record<string, unknown> }; Returns: Database["public"]["Tables"]["creative_projects"]["Row"] | null };
      create_owned_creative_project: { Args: { p_project: Database["public"]["Tables"]["creative_projects"]["Insert"]; p_initial_message: Database["public"]["Tables"]["creative_messages"]["Insert"] }; Returns: { project: Database["public"]["Tables"]["creative_projects"]["Row"]; created: boolean } };
      append_owned_creative_message: { Args: { p_message: Database["public"]["Tables"]["creative_messages"]["Insert"] }; Returns: undefined };
      persist_owned_creative_clarification_answer: { Args: { p_project_id: string; p_user_id: string; p_expected_revision: number; p_message: Database["public"]["Tables"]["creative_messages"]["Insert"] }; Returns: { status: "created" | "duplicate" | "stale"; project?: Database["public"]["Tables"]["creative_projects"]["Row"] } };
      apply_owned_creative_brief_analysis: { Args: { p_project_id: string; p_snapshot: Database["public"]["Tables"]["creative_brief_snapshots"]["Insert"]; p_user_id: string; p_expected_revision: number; p_next_state: "analyzing" | "needs_input" }; Returns: Database["public"]["Tables"]["creative_projects"]["Row"] | null };
      apply_owned_creative_concept_generation: { Args: { p_project_id: string; p_user_id: string; p_expected_revision: number; p_source_brief_revision: number; p_concept_set: Database["public"]["Tables"]["creative_concept_sets"]["Insert"]; p_concepts: Database["public"]["Tables"]["creative_concepts"]["Insert"][] }; Returns: Database["public"]["Tables"]["creative_projects"]["Row"] | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
