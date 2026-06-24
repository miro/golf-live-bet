// Stub types matching the shape Supabase generates.
// Regenerate after every schema migration:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      users: {
        Row: { id: string; tenant_id: string; display_name: string; role: string; created_at: string };
        Insert: { id?: string; tenant_id: string; display_name: string; role?: string; created_at?: string };
        Update: { id?: string; tenant_id?: string; display_name?: string; role?: string; created_at?: string };
        Relationships: [];
      };
      rounds: {
        Row: { id: string; tenant_id: string; name: string; status: string; created_at: string };
        Insert: { id?: string; tenant_id: string; name: string; status?: string; created_at?: string };
        Update: { id?: string; tenant_id?: string; name?: string; status?: string; created_at?: string };
        Relationships: [];
      };
      participants: {
        Row: { id: string; round_id: string; user_id: string; role: string; bankroll: number; created_at: string };
        Insert: { id?: string; round_id: string; user_id: string; role: string; bankroll?: number; created_at?: string };
        Update: { id?: string; round_id?: string; user_id?: string; role?: string; bankroll?: number; created_at?: string };
        Relationships: [];
      };
      event_types: {
        Row: { id: string; key: string; resolution_mode: string; label: string; active: boolean };
        Insert: { id?: string; key: string; resolution_mode: string; label: string; active?: boolean };
        Update: { id?: string; key?: string; resolution_mode?: string; label?: string; active?: boolean };
        Relationships: [];
      };
      events: {
        Row: {
          id: string; round_id: string; type_id: string;
          author_id: string; subject_id: string | null;
          hole: number | null; created_at: string;
          sealed_value: number | null; value_entered_at: string | null;
        };
        Insert: {
          id?: string; round_id: string; type_id: string;
          author_id: string; subject_id?: string | null;
          hole?: number | null; created_at?: string;
          sealed_value?: number | null; value_entered_at?: string | null;
        };
        Update: {
          id?: string; round_id?: string; type_id?: string;
          author_id?: string; subject_id?: string | null;
          hole?: number | null; created_at?: string;
          sealed_value?: number | null; value_entered_at?: string | null;
        };
        Relationships: [];
      };
      markets: {
        Row: {
          id: string; event_id: string; type: string; line: number;
          opens_at: string; closes_at: string; status: string;
          house_seed: number; resolved_outcome: string | null; created_at: string;
        };
        Insert: {
          id?: string; event_id: string; type: string; line: number;
          opens_at?: string; closes_at: string; status?: string;
          house_seed?: number; resolved_outcome?: string | null; created_at?: string;
        };
        Update: {
          id?: string; event_id?: string; type?: string; line?: number;
          opens_at?: string; closes_at?: string; status?: string;
          house_seed?: number; resolved_outcome?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      bets: {
        Row: {
          id: string; market_id: string; participant_id: string;
          selection: string; stake: number; created_at: string; payout: number | null;
        };
        Insert: {
          id?: string; market_id: string; participant_id: string;
          selection: string; stake: number; created_at?: string; payout?: number | null;
        };
        Update: {
          id?: string; market_id?: string; participant_id?: string;
          selection?: string; stake?: number; created_at?: string; payout?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      market_state: {
        Row: {
          id: string; event_id: string; type: string; line: number;
          opens_at: string; closes_at: string; status: string;
          house_seed: number; resolved_outcome: string | null; created_at: string;
          // INV-sealed-value: null while status = 'open'
          sealed_value: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      close_expired_markets: {
        Args: Record<never, never>;
        Returns: number;  // count of markets closed/voided
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
