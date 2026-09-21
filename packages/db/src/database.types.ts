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
      video_brief_revisions: {
        Row: { id: string; project_id: string; user_id: string; version: number; schema_version: string; brief: unknown; is_complete: boolean; generated_by: unknown; source_message_ids: string[]; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; version: number; schema_version: string; brief: unknown; is_complete?: boolean; generated_by: unknown; source_message_ids?: string[]; created_at?: string };
        Update: { is_complete?: boolean };
        Relationships: [{ foreignKeyName: "video_brief_revisions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_messages: {
        Row: { id: string; project_id: string; user_id: string; role: "user" | "assistant"; content: string; controls: unknown; asset_ids: string[]; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; role: "user" | "assistant"; content: string; controls?: unknown; asset_ids?: string[]; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_messages"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_messages_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_moderation_events: {
        Row: { id: string; project_id: string; user_id: string; subject_type: "prompt" | "asset" | "message"; subject_id: string; provider: string; policy_version: string; decision: "allowed" | "blocked" | "review"; reason_code: string | null; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; subject_type: "prompt" | "asset" | "message"; subject_id: string; provider: string; policy_version: string; decision: "allowed" | "blocked" | "review"; reason_code?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_moderation_events"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_moderation_events_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_project_assets: {
        Row: { id: string; project_id: string; user_id: string; object_key: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; byte_size: number; sha256: string; width: number; height: number; rights_confirmed_at: string; moderation_status: "pending" | "allowed" | "blocked"; deleted_at: string | null; created_at: string };
        Insert: { id: string; project_id: string; user_id: string; object_key: string; mime_type: "image/jpeg" | "image/png" | "image/webp"; byte_size: number; sha256: string; width: number; height: number; rights_confirmed_at: string; moderation_status?: "pending" | "allowed" | "blocked"; deleted_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_project_assets"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_project_assets_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_projects: {
        Row: { id: string; user_id: string; title: string; video_type: "product_promo" | "discount_promo" | "product_launch" | "menu_showcase"; style_id: "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark"; duration_seconds: 6 | 10 | 15; aspect_ratio: "9:16" | "1:1" | "16:9"; resolution: "720p" | "1080p"; language: string; voice_over_enabled: boolean; music_enabled: boolean; status: "draft" | "interviewing" | "awaiting_approval" | "approved" | "rendering" | "ready" | "revision_draft" | "moderation_blocked" | "failed" | "deleted"; revision_render_count: number; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; title: string; video_type: "product_promo" | "discount_promo" | "product_launch" | "menu_showcase"; style_id: "bold_pop" | "clean_product" | "warm_artisan" | "premium_dark"; duration_seconds: 6 | 10 | 15; aspect_ratio: "9:16" | "1:1" | "16:9"; resolution: "720p" | "1080p"; language: string; voice_over_enabled?: boolean; music_enabled?: boolean; status?: "draft" | "interviewing" | "awaiting_approval" | "approved" | "rendering" | "ready" | "revision_draft" | "moderation_blocked" | "failed" | "deleted"; revision_render_count?: number; deleted_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_projects"]["Row"]>;
        Relationships: [];
      };
      video_render_jobs: {
        Row: { id: string; project_id: string; user_id: string; idempotency_key: string; brief_revision_id: string; storyboard_revision_id: string; parent_version_id: string | null; is_revision: boolean; input_snapshot: unknown; status: "queued" | "preparing" | "rendering" | "uploading" | "succeeded" | "failed" | "cancelled"; attempts: number; queued_at: string; started_at: string | null; finished_at: string | null; error_code: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; project_id: string; user_id: string; idempotency_key: string; brief_revision_id: string; storyboard_revision_id: string; parent_version_id?: string | null; is_revision: boolean; input_snapshot: unknown; status?: "queued" | "preparing" | "rendering" | "uploading" | "succeeded" | "failed" | "cancelled"; attempts?: number; queued_at?: string; started_at?: string | null; finished_at?: string | null; error_code?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_render_jobs"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_render_jobs_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_storyboard_revisions: {
        Row: { id: string; project_id: string; user_id: string; version: number; schema_version: string; brief_revision_id: string; scenes: unknown; total_duration_seconds: 6 | 10 | 15; generated_by: unknown; approved_at: string | null; approval_snapshot: unknown; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; version: number; schema_version: string; brief_revision_id: string; scenes: unknown; total_duration_seconds: 6 | 10 | 15; generated_by: unknown; approved_at?: string | null; approval_snapshot?: unknown; created_at?: string };
        Update: { approved_at?: string | null; approval_snapshot?: unknown };
        Relationships: [{ foreignKeyName: "video_storyboard_revisions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
      video_versions: {
        Row: { id: string; project_id: string; user_id: string; version_number: number; render_job_id: string; parent_version_id: string | null; output_object_key: string; duration_seconds: number; aspect_ratio: string; resolution: string; manifest_hash: string; created_at: string };
        Insert: { id?: string; project_id: string; user_id: string; version_number: number; render_job_id: string; parent_version_id?: string | null; output_object_key: string; duration_seconds: number; aspect_ratio: string; resolution: string; manifest_hash: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_versions"]["Row"]>;
        Relationships: [{ foreignKeyName: "video_versions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "video_projects"; referencedColumns: ["id"] }];
      };
    };
    Views: Record<string, never>;
    Functions: {
      allocate_billing_provider_attempt: { Args: { p_billing_payment_id: string; p_provider: string; p_environment: string; p_provider_reference: string; p_provider_idempotency_key: string }; Returns: Database["public"]["Tables"]["billing_provider_attempts"]["Row"] };
      receive_billing_webhook: { Args: { p_provider: string; p_environment: string; p_deduplication_key: string; p_event_type: string; p_normalized_status: string; p_provider_reference: string; p_provider_payment_id: string; p_amount: number; p_currency: string; p_occurred_at: string }; Returns: string };
      fulfill_billing_webhook: { Args: { p_event_id: string; p_max_attempts?: number; p_verified_failed_settlement?: boolean }; Returns: "retryable" | "fulfilled" | "duplicate_paid" | "quarantined_requires_review" | "quarantined_paid_after_failed" | "quarantined_paid_after_cancelled" | "already_paid" | "stale_attempt_observation" | "terminal_observation" | "requires_action" | "no_op" };
      record_billing_webhook_failure: { Args: { p_event_id: string; p_error_sanitized: string; p_max_attempts?: number; p_base_delay_seconds?: number; p_max_delay_seconds?: number }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
