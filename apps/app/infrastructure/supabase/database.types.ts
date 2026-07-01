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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
