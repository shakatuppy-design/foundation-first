export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_activity_logs: {
        Row: {
          actor_id: string | null
          agent_id: string | null
          created_at: string
          event: string
          id: string
          organization_id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          agent_id?: string | null
          created_at?: string
          event: string
          id?: string
          organization_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          agent_id?: string | null
          created_at?: string
          event?: string
          id?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_logs_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_capability_contracts: {
        Row: {
          accepted_at: string | null
          agent_id: string
          allowed_data: string[]
          capability_key: string
          capability_request_id: string | null
          constraints: Json
          contract_id: string
          created_at: string
          created_by: string | null
          decided_by: string | null
          decision_note: string | null
          effective_from: string | null
          expired_at: string | null
          expires_at: string | null
          id: string
          limits: Json
          organization_id: string
          prohibited_data: string[]
          proposed_at: string | null
          rejected_at: string | null
          requester_digital_profile_id: string
          requester_note: string | null
          revoked_at: string | null
          scope: Json
          status: Database["public"]["Enums"]["capability_contract_status"]
          supersedes_contract_id: string | null
          updated_at: string
          verification_id: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          agent_id: string
          allowed_data?: string[]
          capability_key: string
          capability_request_id?: string | null
          constraints?: Json
          contract_id?: string
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decision_note?: string | null
          effective_from?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          limits?: Json
          organization_id: string
          prohibited_data?: string[]
          proposed_at?: string | null
          rejected_at?: string | null
          requester_digital_profile_id: string
          requester_note?: string | null
          revoked_at?: string | null
          scope?: Json
          status?: Database["public"]["Enums"]["capability_contract_status"]
          supersedes_contract_id?: string | null
          updated_at?: string
          verification_id: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          agent_id?: string
          allowed_data?: string[]
          capability_key?: string
          capability_request_id?: string | null
          constraints?: Json
          contract_id?: string
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decision_note?: string | null
          effective_from?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          limits?: Json
          organization_id?: string
          prohibited_data?: string[]
          proposed_at?: string | null
          rejected_at?: string | null
          requester_digital_profile_id?: string
          requester_note?: string | null
          revoked_at?: string | null
          scope?: Json
          status?: Database["public"]["Enums"]["capability_contract_status"]
          supersedes_contract_id?: string | null
          updated_at?: string
          verification_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "acc_agent_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "acc_capability_request_fkey"
            columns: ["capability_request_id"]
            isOneToOne: false
            referencedRelation: "agent_capability_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_requester_profile_fkey"
            columns: ["requester_digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_supersedes_fkey"
            columns: ["supersedes_contract_id"]
            isOneToOne: false
            referencedRelation: "agent_capability_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_verification_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "agent_capability_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_capability_requests: {
        Row: {
          cancelled_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          priority: Database["public"]["Enums"]["capability_request_priority"]
          request_context: Json
          request_id: string
          request_type: Database["public"]["Enums"]["capability_request_type"]
          requested_capability: string
          requester_digital_profile_id: string
          requester_note: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["capability_request_status"]
          target_agent_id: string
          target_organization_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["capability_request_priority"]
          request_context?: Json
          request_id?: string
          request_type?: Database["public"]["Enums"]["capability_request_type"]
          requested_capability: string
          requester_digital_profile_id: string
          requester_note?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["capability_request_status"]
          target_agent_id: string
          target_organization_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["capability_request_priority"]
          request_context?: Json
          request_id?: string
          request_type?: Database["public"]["Enums"]["capability_request_type"]
          requested_capability?: string
          requester_digital_profile_id?: string
          requester_note?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["capability_request_status"]
          target_agent_id?: string
          target_organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_capability_requests_agent_org_fkey"
            columns: ["target_agent_id", "target_organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_capability_requests_requester_digital_profile_id_fkey"
            columns: ["requester_digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_capability_requests_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_capability_requests_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_capability_verifications: {
        Row: {
          agent_id: string
          attestation_note: string | null
          capability_key: string
          created_at: string
          decision_note: string | null
          evidence: Json
          expired_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          rejected_at: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["capability_verification_status"]
          updated_at: string
          verification_id: string
          verification_method: Database["public"]["Enums"]["verification_method"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          agent_id: string
          attestation_note?: string | null
          capability_key: string
          created_at?: string
          decision_note?: string | null
          evidence?: Json
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          rejected_at?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["capability_verification_status"]
          updated_at?: string
          verification_id?: string
          verification_method?: Database["public"]["Enums"]["verification_method"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          agent_id?: string
          attestation_note?: string | null
          capability_key?: string
          created_at?: string
          decision_note?: string | null
          evidence?: Json
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          rejected_at?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["capability_verification_status"]
          updated_at?: string
          verification_id?: string
          verification_method?: Database["public"]["Enums"]["verification_method"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acv_agent_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acv_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "acv_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_discovery_profiles: {
        Row: {
          agent_id: string
          capabilities: string[]
          categories: string[]
          created_at: string
          description: string
          discovery_id: string
          display_name: string
          id: string
          organization_id: string
          status: Database["public"]["Enums"]["discovery_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["discovery_visibility"]
        }
        Insert: {
          agent_id: string
          capabilities?: string[]
          categories?: string[]
          created_at?: string
          description?: string
          discovery_id?: string
          display_name: string
          id?: string
          organization_id: string
          status?: Database["public"]["Enums"]["discovery_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["discovery_visibility"]
        }
        Update: {
          agent_id?: string
          capabilities?: string[]
          categories?: string[]
          created_at?: string
          description?: string
          discovery_id?: string
          display_name?: string
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["discovery_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["discovery_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_discovery_profiles_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_discovery_profiles_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_discovery_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_permissions: {
        Row: {
          agent_id: string
          allowed: boolean
          created_at: string
          id: string
          organization_id: string
          permission_key: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          allowed?: boolean
          created_at?: string
          id?: string
          organization_id: string
          permission_key: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          allowed?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          permission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_permissions_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string
          id: string
          kind: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_authority_rules: {
        Row: {
          agent_id: string | null
          allowed: boolean
          capability: Database["public"]["Enums"]["digital_capability"]
          created_at: string
          digital_profile_id: string
          expires_at: string | null
          granted_by: string | null
          id: string
          organization_id: string
          scope: Json
          status: Database["public"]["Enums"]["digital_authority_status"]
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          allowed?: boolean
          capability: Database["public"]["Enums"]["digital_capability"]
          created_at?: string
          digital_profile_id: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          organization_id: string
          scope?: Json
          status?: Database["public"]["Enums"]["digital_authority_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          allowed?: boolean
          capability?: Database["public"]["Enums"]["digital_capability"]
          created_at?: string
          digital_profile_id?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          organization_id?: string
          scope?: Json
          status?: Database["public"]["Enums"]["digital_authority_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_authority_rules_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "digital_authority_rules_digital_profile_id_fkey"
            columns: ["digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_authority_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_authority_rules_profile_org_fkey"
            columns: ["digital_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      digital_goals: {
        Row: {
          created_at: string
          description: string
          digital_profile_id: string
          id: string
          priority: Database["public"]["Enums"]["digital_goal_priority"]
          status: Database["public"]["Enums"]["digital_goal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          digital_profile_id: string
          id?: string
          priority?: Database["public"]["Enums"]["digital_goal_priority"]
          status?: Database["public"]["Enums"]["digital_goal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          digital_profile_id?: string
          id?: string
          priority?: Database["public"]["Enums"]["digital_goal_priority"]
          status?: Database["public"]["Enums"]["digital_goal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_goals_digital_profile_id_fkey"
            columns: ["digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_intents: {
        Row: {
          created_at: string
          description: string
          digital_profile_id: string
          discovery_requirement: Json
          id: string
          intent_type: Database["public"]["Enums"]["digital_intent_type"]
          priority: Database["public"]["Enums"]["digital_intent_priority"]
          status: Database["public"]["Enums"]["digital_intent_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          digital_profile_id: string
          discovery_requirement?: Json
          id?: string
          intent_type?: Database["public"]["Enums"]["digital_intent_type"]
          priority?: Database["public"]["Enums"]["digital_intent_priority"]
          status?: Database["public"]["Enums"]["digital_intent_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          digital_profile_id?: string
          discovery_requirement?: Json
          id?: string
          intent_type?: Database["public"]["Enums"]["digital_intent_type"]
          priority?: Database["public"]["Enums"]["digital_intent_priority"]
          status?: Database["public"]["Enums"]["digital_intent_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_intents_digital_profile_id_fkey"
            columns: ["digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_memory_items: {
        Row: {
          confidence: number
          content: string
          created_at: string
          digital_profile_id: string
          id: string
          memory_type: string
          source: string
          updated_at: string
          visibility: Database["public"]["Enums"]["digital_visibility"]
        }
        Insert: {
          confidence?: number
          content: string
          created_at?: string
          digital_profile_id: string
          id?: string
          memory_type?: string
          source?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["digital_visibility"]
        }
        Update: {
          confidence?: number
          content?: string
          created_at?: string
          digital_profile_id?: string
          id?: string
          memory_type?: string
          source?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["digital_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "digital_memory_items_digital_profile_id_fkey"
            columns: ["digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_preferences: {
        Row: {
          created_at: string
          digital_profile_id: string
          id: string
          key: string
          updated_at: string
          value: string
          visibility: Database["public"]["Enums"]["digital_visibility"]
        }
        Insert: {
          created_at?: string
          digital_profile_id: string
          id?: string
          key: string
          updated_at?: string
          value?: string
          visibility?: Database["public"]["Enums"]["digital_visibility"]
        }
        Update: {
          created_at?: string
          digital_profile_id?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
          visibility?: Database["public"]["Enums"]["digital_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "digital_preferences_digital_profile_id_fkey"
            columns: ["digital_profile_id"]
            isOneToOne: false
            referencedRelation: "digital_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          metadata: Json
          organization_id: string
          profile_type: string
          status: Database["public"]["Enums"]["digital_profile_status"]
          updated_at: string
          user_id: string | null
          visibility: Database["public"]["Enums"]["digital_visibility"]
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          metadata?: Json
          organization_id: string
          profile_type?: string
          status?: Database["public"]["Enums"]["digital_profile_status"]
          updated_at?: string
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["digital_visibility"]
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          metadata?: Json
          organization_id?: string
          profile_type?: string
          status?: Database["public"]["Enums"]["digital_profile_status"]
          updated_at?: string
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["digital_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "digital_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pilot_emergency_events: {
        Row: {
          activated_by: string
          created_at: string
          id: string
          new_state: string
          organization_id: string
          pilot_key: string
          previous_state: string
          reason: string
          seq: number
        }
        Insert: {
          activated_by?: string
          created_at?: string
          id?: string
          new_state: string
          organization_id: string
          pilot_key?: string
          previous_state: string
          reason: string
          seq?: number
        }
        Update: {
          activated_by?: string
          created_at?: string
          id?: string
          new_state?: string
          organization_id?: string
          pilot_key?: string
          previous_state?: string
          reason?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "pilot_emergency_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_lesson_review_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: string
          lesson_review_id: string
          new_state: Database["public"]["Enums"]["lesson_state"]
          note: string
          organization_id: string
          previous_state: Database["public"]["Enums"]["lesson_state"] | null
          seq: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: string
          lesson_review_id: string
          new_state: Database["public"]["Enums"]["lesson_state"]
          note?: string
          organization_id: string
          previous_state?: Database["public"]["Enums"]["lesson_state"] | null
          seq?: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          id?: string
          lesson_review_id?: string
          new_state?: Database["public"]["Enums"]["lesson_state"]
          note?: string
          organization_id?: string
          previous_state?: Database["public"]["Enums"]["lesson_state"] | null
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "pilot_lesson_review_events_lesson_review_id_fkey"
            columns: ["lesson_review_id"]
            isOneToOne: false
            referencedRelation: "pilot_lesson_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_lesson_review_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_lesson_reviews: {
        Row: {
          agent_output_reference: Json
          correction: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          human_verdict: Database["public"]["Enums"]["lesson_human_verdict"]
          id: string
          lesson_candidate: string
          organization_id: string
          pilot_key: string
          reviewed_at: string | null
          reviewer: string
          state: Database["public"]["Enums"]["lesson_state"]
          supporting_evidence: string[]
          updated_at: string
        }
        Insert: {
          agent_output_reference: Json
          correction?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          human_verdict: Database["public"]["Enums"]["lesson_human_verdict"]
          id?: string
          lesson_candidate?: string
          organization_id: string
          pilot_key?: string
          reviewed_at?: string | null
          reviewer: string
          state?: Database["public"]["Enums"]["lesson_state"]
          supporting_evidence?: string[]
          updated_at?: string
        }
        Update: {
          agent_output_reference?: Json
          correction?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          human_verdict?: Database["public"]["Enums"]["lesson_human_verdict"]
          id?: string
          lesson_candidate?: string
          organization_id?: string
          pilot_key?: string
          reviewed_at?: string | null
          reviewer?: string
          state?: Database["public"]["Enums"]["lesson_state"]
          supporting_evidence?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_lesson_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_opportunity_outcomes: {
        Row: {
          action_description: string
          actual_value_idr: number
          baseline_metric: string
          created_at: string
          decision: Database["public"]["Enums"]["revenue_human_decision"]
          evidence_reference: string[]
          human_review_cost_idr: number
          id: string
          note: string
          opportunity_id: string
          organization_id: string
          post_action_metric: string
          recorded_by: string
          value_kind: Database["public"]["Enums"]["revenue_value_kind"]
        }
        Insert: {
          action_description?: string
          actual_value_idr?: number
          baseline_metric?: string
          created_at?: string
          decision: Database["public"]["Enums"]["revenue_human_decision"]
          evidence_reference?: string[]
          human_review_cost_idr?: number
          id?: string
          note?: string
          opportunity_id: string
          organization_id: string
          post_action_metric?: string
          recorded_by: string
          value_kind?: Database["public"]["Enums"]["revenue_value_kind"]
        }
        Update: {
          action_description?: string
          actual_value_idr?: number
          baseline_metric?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["revenue_human_decision"]
          evidence_reference?: string[]
          human_review_cost_idr?: number
          id?: string
          note?: string
          opportunity_id?: string
          organization_id?: string
          post_action_metric?: string
          recorded_by?: string
          value_kind?: Database["public"]["Enums"]["revenue_value_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "pilot_opportunity_outcomes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "pilot_revenue_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_opportunity_outcomes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_revenue_opportunities: {
        Row: {
          ai_cost_idr: number
          confidence: number
          created_at: string
          created_by: string
          dataset_label: string
          estimated_value_idr: number
          evidence: string[]
          expected_impact: string
          human_decision: Database["public"]["Enums"]["revenue_human_decision"]
          id: string
          input_tokens: number | null
          kind: string
          latency_ms: number
          model: string
          must_verify: string[]
          opportunity: string
          organization_id: string
          output_tokens: number | null
          pilot_key: string
          reasoning_status: string
          updated_at: string
        }
        Insert: {
          ai_cost_idr?: number
          confidence: number
          created_at?: string
          created_by: string
          dataset_label: string
          estimated_value_idr?: number
          evidence?: string[]
          expected_impact?: string
          human_decision?: Database["public"]["Enums"]["revenue_human_decision"]
          id?: string
          input_tokens?: number | null
          kind: string
          latency_ms?: number
          model: string
          must_verify?: string[]
          opportunity: string
          organization_id: string
          output_tokens?: number | null
          pilot_key: string
          reasoning_status: string
          updated_at?: string
        }
        Update: {
          ai_cost_idr?: number
          confidence?: number
          created_at?: string
          created_by?: string
          dataset_label?: string
          estimated_value_idr?: number
          evidence?: string[]
          expected_impact?: string
          human_decision?: Database["public"]["Enums"]["revenue_human_decision"]
          id?: string
          input_tokens?: number | null
          kind?: string
          latency_ms?: number
          model?: string
          must_verify?: string[]
          opportunity?: string
          organization_id?: string
          output_tokens?: number | null
          pilot_key?: string
          reasoning_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_revenue_opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_has_authority: {
        Args: {
          _agent: string
          _capability: Database["public"]["Enums"]["digital_capability"]
          _profile: string
        }
        Returns: boolean
      }
      agent_is_eligible: { Args: { _agent: string }; Returns: boolean }
      can_read_digital_profile: { Args: { _profile: string }; Returns: boolean }
      controls_digital_profile: { Args: { _profile: string }; Returns: boolean }
      create_organization: {
        Args: { _name: string; _slug: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      digital_profile_org: { Args: { _profile: string }; Returns: string }
      generate_discovery_id: { Args: never; Returns: string }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      shares_organization: { Args: { _user: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "admin" | "member"
      capability_contract_status:
        | "draft"
        | "proposed"
        | "accepted"
        | "rejected"
        | "revoked"
        | "expired"
      capability_request_priority: "normal" | "high" | "urgent"
      capability_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      capability_request_type: "capability_request"
      capability_verification_status:
        | "pending"
        | "verified"
        | "rejected"
        | "revoked"
        | "expired"
      digital_authority_status: "active" | "revoked" | "expired"
      digital_capability:
        | "read_profile"
        | "read_preference"
        | "read_goal"
        | "read_memory"
        | "create_intent"
        | "request_capability"
        | "request_quote"
        | "request_action"
      digital_goal_priority: "low" | "medium" | "high" | "critical"
      digital_goal_status:
        | "draft"
        | "active"
        | "paused"
        | "achieved"
        | "abandoned"
      digital_intent_priority: "low" | "medium" | "high" | "critical"
      digital_intent_status:
        | "draft"
        | "active"
        | "paused"
        | "fulfilled"
        | "cancelled"
        | "expired"
      digital_intent_type:
        | "general"
        | "discovery"
        | "procurement"
        | "logistics"
        | "service"
        | "research"
      digital_profile_status: "active" | "inactive" | "archived"
      digital_visibility: "private" | "shared" | "public"
      discovery_status: "draft" | "listed" | "delisted"
      discovery_visibility: "private" | "unlisted" | "public"
      lesson_human_verdict:
        | "CORRECT"
        | "INCORRECT"
        | "PARTIALLY_CORRECT"
        | "NEEDS_MORE_DATA"
        | "UNKNOWN"
      lesson_state: "CANDIDATE" | "REVIEWED" | "APPROVED" | "REJECTED"
      revenue_human_decision:
        | "PENDING"
        | "ACTION_TAKEN"
        | "NO_ACTION"
        | "REJECTED"
        | "NEEDS_MORE_DATA"
      revenue_value_kind: "NONE" | "REVENUE_INCREASE" | "COST_SAVING"
      verification_method:
        | "org_self_attested"
        | "platform_verified"
        | "external_verified"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "member"],
      capability_contract_status: [
        "draft",
        "proposed",
        "accepted",
        "rejected",
        "revoked",
        "expired",
      ],
      capability_request_priority: ["normal", "high", "urgent"],
      capability_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      capability_request_type: ["capability_request"],
      capability_verification_status: [
        "pending",
        "verified",
        "rejected",
        "revoked",
        "expired",
      ],
      digital_authority_status: ["active", "revoked", "expired"],
      digital_capability: [
        "read_profile",
        "read_preference",
        "read_goal",
        "read_memory",
        "create_intent",
        "request_capability",
        "request_quote",
        "request_action",
      ],
      digital_goal_priority: ["low", "medium", "high", "critical"],
      digital_goal_status: [
        "draft",
        "active",
        "paused",
        "achieved",
        "abandoned",
      ],
      digital_intent_priority: ["low", "medium", "high", "critical"],
      digital_intent_status: [
        "draft",
        "active",
        "paused",
        "fulfilled",
        "cancelled",
        "expired",
      ],
      digital_intent_type: [
        "general",
        "discovery",
        "procurement",
        "logistics",
        "service",
        "research",
      ],
      digital_profile_status: ["active", "inactive", "archived"],
      digital_visibility: ["private", "shared", "public"],
      discovery_status: ["draft", "listed", "delisted"],
      discovery_visibility: ["private", "unlisted", "public"],
      lesson_human_verdict: [
        "CORRECT",
        "INCORRECT",
        "PARTIALLY_CORRECT",
        "NEEDS_MORE_DATA",
        "UNKNOWN",
      ],
      lesson_state: ["CANDIDATE", "REVIEWED", "APPROVED", "REJECTED"],
      revenue_human_decision: [
        "PENDING",
        "ACTION_TAKEN",
        "NO_ACTION",
        "REJECTED",
        "NEEDS_MORE_DATA",
      ],
      revenue_value_kind: ["NONE", "REVENUE_INCREASE", "COST_SAVING"],
      verification_method: [
        "org_self_attested",
        "platform_verified",
        "external_verified",
      ],
    },
  },
} as const
