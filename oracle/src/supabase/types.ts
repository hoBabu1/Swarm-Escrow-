// Mirrors the schema in the "Supabase Schema" section of CLAUDE.md.
export type AgentRoleLabel = "reviewer" | "fraud_sanity" | "arbiter" | "senior_arbiter";

export interface Database {
  public: {
    Tables: {
      verdicts: {
        Row: {
          id: number;
          escrow_id: number;
          chain_id: number;
          agent_role: AgentRoleLabel;
          verdict: boolean;
          reasoning_text: string;
          reasoning_hash: string;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          escrow_id: number;
          chain_id: number;
          agent_role: AgentRoleLabel;
          verdict: boolean;
          reasoning_text: string;
          reasoning_hash: string;
          tx_hash?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["verdicts"]["Insert"]>;
      };
      escrow_specs: {
        Row: {
          id: number;
          escrow_id: number;
          chain_id: number;
          spec_text: string;
          spec_hash: string;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          escrow_id: number;
          chain_id: number;
          spec_text: string;
          spec_hash: string;
          tx_hash?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["escrow_specs"]["Insert"]>;
      };
      challenge_docs: {
        Row: {
          id: number;
          escrow_id: number;
          chain_id: number;
          challenger_address: string;
          document_text: string;
          document_hash: string;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          escrow_id: number;
          chain_id: number;
          challenger_address: string;
          document_text: string;
          document_hash: string;
          tx_hash?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["challenge_docs"]["Insert"]>;
      };
      feedback_messages: {
        Row: {
          id: number;
          escrow_id: number;
          chain_id: number;
          sender_address: string;
          message_text: string;
          message_hash: string;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          escrow_id: number;
          chain_id: number;
          sender_address: string;
          message_text: string;
          message_hash: string;
          tx_hash?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["feedback_messages"]["Insert"]>;
      };
    };
  };
}
