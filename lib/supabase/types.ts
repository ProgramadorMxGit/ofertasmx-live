/**
 * Hand-written `Database` type for the Supabase clients (Task 10, R8.5/R8.7).
 *
 * `supabase gen types typescript` cannot run here because there is no live
 * project to introspect, so this type is maintained by hand to stay faithful to
 * the SQL migrations under `supabase/migrations/`:
 *
 *   0001_init.sql        -> enums `offer_status`, `platform_t`; table `offers`
 *   0002_aux_tables.sql  -> `offer_categories`, `telegram_updates`,
 *                           `offer_clicks`, `admin_audit_logs`
 *   0003_indexes_triggers-> FK `offers.category_id -> offer_categories(id)`
 *   0004_rls.sql         -> table `admin_allowlist`; function `is_admin()`
 *
 * Conventions match `supabase gen types` output so it can be swapped for a
 * generated file later without changing call sites:
 *   - Postgres `uuid`/`text`/`timestamptz` -> `string`
 *   - Postgres `numeric`/`int`/`bigint`    -> `number`   (gen types use `number`)
 *   - `jsonb`                              -> `Json`
 *   - `Row`    has every column at its exact nullability.
 *   - `Insert` makes columns with a default or `NULL` allowance optional.
 *   - `Update` makes every column optional.
 *
 * Strict: no `any`. The shape satisfies `@supabase/supabase-js`'s
 * `GenericSchema`, so `SupabaseClient<Database>` is fully typed.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      offers: {
        Row: {
          id: string;
          platform: Database["public"]["Enums"]["platform_t"];
          merchant: string;
          external_product_id: string | null;
          fingerprint: string;
          telegram_chat_id: number;
          telegram_message_id: number;
          telegram_update_id: number;
          title: string;
          slug: string;
          short_description: string | null;
          editorial_summary: string | null;
          image_url: string | null;
          image_storage_path: string | null;
          image_alt: string | null;
          image_status: string;
          image_retry_count: number;
          image_last_attempt_at: string | null;
          original_price: number | null;
          current_price: number;
          discount_percent: number | null;
          currency: string;
          affiliate_url: string | null;
          category_id: string | null;
          status: Database["public"]["Enums"]["offer_status"];
          is_featured: boolean;
          needs_review: boolean;
          affiliate_tag: string | null;
          raw_text: string | null;
          published_at: string | null;
          updated_at: string;
          last_verified_at: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: Database["public"]["Enums"]["platform_t"];
          merchant: string;
          external_product_id?: string | null;
          fingerprint: string;
          telegram_chat_id: number;
          telegram_message_id: number;
          telegram_update_id: number;
          title: string;
          slug: string;
          short_description?: string | null;
          editorial_summary?: string | null;
          image_url?: string | null;
          image_storage_path?: string | null;
          image_alt?: string | null;
          image_status?: string;
          image_retry_count?: number;
          image_last_attempt_at?: string | null;
          original_price?: number | null;
          current_price: number;
          discount_percent?: number | null;
          currency?: string;
          affiliate_url?: string | null;
          category_id?: string | null;
          status?: Database["public"]["Enums"]["offer_status"];
          is_featured?: boolean;
          needs_review?: boolean;
          affiliate_tag?: string | null;
          raw_text?: string | null;
          published_at?: string | null;
          updated_at?: string;
          last_verified_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform?: Database["public"]["Enums"]["platform_t"];
          merchant?: string;
          external_product_id?: string | null;
          fingerprint?: string;
          telegram_chat_id?: number;
          telegram_message_id?: number;
          telegram_update_id?: number;
          title?: string;
          slug?: string;
          short_description?: string | null;
          editorial_summary?: string | null;
          image_url?: string | null;
          image_storage_path?: string | null;
          image_alt?: string | null;
          image_status?: string;
          image_retry_count?: number;
          image_last_attempt_at?: string | null;
          original_price?: number | null;
          current_price?: number;
          discount_percent?: number | null;
          currency?: string;
          affiliate_url?: string | null;
          category_id?: string | null;
          status?: Database["public"]["Enums"]["offer_status"];
          is_featured?: boolean;
          needs_review?: boolean;
          affiliate_tag?: string | null;
          raw_text?: string | null;
          published_at?: string | null;
          updated_at?: string;
          last_verified_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "offer_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      offer_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      telegram_updates: {
        Row: {
          update_id: number;
          message_id: number | null;
          chat_id: number | null;
          update_type: string | null;
          payload: Json | null;
          processing_status: string;
          error_message: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          update_id: number;
          message_id?: number | null;
          chat_id?: number | null;
          update_type?: string | null;
          payload?: Json | null;
          processing_status?: string;
          error_message?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          update_id?: number;
          message_id?: number | null;
          chat_id?: number | null;
          update_type?: string | null;
          payload?: Json | null;
          processing_status?: string;
          error_message?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      offer_clicks: {
        Row: {
          id: string;
          offer_id: string;
          source: string | null;
          referrer_domain: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          offer_id: string;
          source?: string | null;
          referrer_domain?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          offer_id?: string;
          source?: string | null;
          referrer_domain?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offer_clicks_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          actor_email: string | null;
          action: string;
          offer_id: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_email?: string | null;
          action: string;
          offer_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_email?: string | null;
          action?: string;
          offer_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_allowlist: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      offer_status:
        | "draft"
        | "active"
        | "expired"
        | "hidden"
        | "rejected"
        | "needs_review";
      platform_t: "amazon" | "mercado_libre";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

/** Convenience helpers mirroring `supabase gen types` output. */
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
