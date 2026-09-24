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
      access_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          grants: string
          id: string
          max_uses: number
          note: string | null
          revoked: boolean
          trial_days: number | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          grants?: string
          id?: string
          max_uses?: number
          note?: string | null
          revoked?: boolean
          trial_days?: number | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          grants?: string
          id?: string
          max_uses?: number
          note?: string | null
          revoked?: boolean
          trial_days?: number | null
          used_count?: number
        }
        Relationships: []
      }
      access_events: {
        Row: {
          created_at: string
          detail: Json
          family_id: string | null
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          family_id?: string | null
          id?: string
          kind: string
        }
        Update: {
          created_at?: string
          detail?: Json
          family_id?: string | null
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string
          app_store_url: string | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          institution: string | null
          is_archived: boolean
          is_joint: boolean
          is_private: boolean
          linked_app_url: string | null
          name: string
          opening_balance: number
          owner_member_id: string | null
          play_store_url: string | null
          sub_note: string | null
        }
        Insert: {
          account_type?: string
          app_store_url?: string | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          institution?: string | null
          is_archived?: boolean
          is_joint?: boolean
          is_private?: boolean
          linked_app_url?: string | null
          name: string
          opening_balance?: number
          owner_member_id?: string | null
          play_store_url?: string | null
          sub_note?: string | null
        }
        Update: {
          account_type?: string
          app_store_url?: string | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          institution?: string | null
          is_archived?: boolean
          is_joint?: boolean
          is_private?: boolean
          linked_app_url?: string | null
          name?: string
          opening_balance?: number
          owner_member_id?: string | null
          play_store_url?: string | null
          sub_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          applies_to_whole_family: boolean
          budget: number | null
          created_at: string
          created_by: string | null
          end_at: string | null
          family_id: string
          id: string
          kind: string
          location: string | null
          notes: string | null
          repeat: string
          start_at: string
          status: string
          title: string
        }
        Insert: {
          applies_to_whole_family?: boolean
          budget?: number | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          family_id: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          repeat?: string
          start_at: string
          status?: string
          title: string
        }
        Update: {
          applies_to_whole_family?: boolean
          budget?: number | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          family_id?: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          repeat?: string
          start_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_members: {
        Row: {
          activity_id: string
          member_id: string
        }
        Insert: {
          activity_id: string
          member_id: string
        }
        Update: {
          activity_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_members_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_tags: {
        Row: {
          activity_id: string
          tag: string
        }
        Insert: {
          activity_id: string
          tag: string
        }
        Update: {
          activity_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_tags_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acquired_on: string | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          is_joint: boolean
          kind: string
          name: string
          note: string | null
          owner_member_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          acquired_on?: string | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          is_joint?: boolean
          kind?: string
          name: string
          note?: string | null
          owner_member_id?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          acquired_on?: string | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          is_joint?: boolean
          kind?: string
          name?: string
          note?: string | null
          owner_member_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_checkouts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          family_id: string
          id: string
          paid_at: string | null
          plan: string
          provider: string
          provider_ref: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          family_id: string
          id?: string
          paid_at?: string | null
          plan: string
          provider?: string
          provider_ref?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          family_id?: string
          id?: string
          paid_at?: string | null
          plan?: string
          provider?: string
          provider_ref?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_checkouts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          family_id: string
          id: string
          name: string
          paid_at: string | null
          paid_by_member_id: string | null
          paid_from_account_id: string | null
          recurrence: string | null
          status: string
          sub_note: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          family_id: string
          id?: string
          name: string
          paid_at?: string | null
          paid_by_member_id?: string | null
          paid_from_account_id?: string | null
          recurrence?: string | null
          status?: string
          sub_note?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          family_id?: string
          id?: string
          name?: string
          paid_at?: string | null
          paid_by_member_id?: string | null
          paid_from_account_id?: string | null
          recurrence?: string | null
          status?: string
          sub_note?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_paid_by_member_id_fkey"
            columns: ["paid_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "wealth_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_allocations: {
        Row: {
          amount: number
          budget_period_id: string
          category: string
          family_id: string
          id: string
        }
        Insert: {
          amount: number
          budget_period_id: string
          category: string
          family_id: string
          id?: string
        }
        Update: {
          amount?: number
          budget_period_id?: string
          category?: string
          family_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_allocations_budget_period_id_fkey"
            columns: ["budget_period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_allocations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          budget_amount: number
          family_id: string
          id: string
          period_month: number
          period_year: number
        }
        Insert: {
          budget_amount: number
          family_id: string
          id?: string
          period_month: number
          period_year: number
        }
        Update: {
          budget_amount?: number
          family_id?: string
          id?: string
          period_month?: number
          period_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_periods_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_items: {
        Row: {
          checked: boolean
          checked_at: string | null
          cleared: boolean
          cleared_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id: string | null
          name: string
          planned_for: string | null
          quantity: number | null
          section: string
          source: string
          unit: string | null
          unit_price_override: number | null
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          cleared?: boolean
          cleared_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id?: string | null
          name: string
          planned_for?: string | null
          quantity?: number | null
          section?: string
          source: string
          unit?: string | null
          unit_price_override?: number | null
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          cleared?: boolean
          cleared_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string | null
          name?: string
          planned_for?: string | null
          quantity?: number | null
          section?: string
          source?: string
          unit?: string | null
          unit_price_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_links: {
        Row: {
          created_at: string
          family_id: string
          google_event_id: string
          id: string
          member_id: string
          source_id: string
          source_table: string
        }
        Insert: {
          created_at?: string
          family_id: string
          google_event_id: string
          id?: string
          member_id: string
          source_id: string
          source_table: string
        }
        Update: {
          created_at?: string
          family_id?: string
          google_event_id?: string
          id?: string
          member_id?: string
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_links_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_failures: {
        Row: {
          attempts: number
          family_id: string
          first_seen_at: string
          google_event_id: string
          id: string
          last_error: string | null
          last_seen_at: string
          member_id: string
        }
        Insert: {
          attempts?: number
          family_id: string
          first_seen_at?: string
          google_event_id: string
          id?: string
          last_error?: string | null
          last_seen_at?: string
          member_id: string
        }
        Update: {
          attempts?: number
          family_id?: string
          first_seen_at?: string
          google_event_id?: string
          id?: string
          last_error?: string | null
          last_seen_at?: string
          member_id?: string
        }
        Relationships: []
      }
      calendar_links: {
        Row: {
          account_email: string | null
          calendar_id: string
          connected: boolean
          family_id: string
          last_synced_at: string | null
          member_id: string
          sync_token: string | null
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          calendar_id?: string
          connected?: boolean
          family_id: string
          last_synced_at?: string | null
          member_id: string
          sync_token?: string | null
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          calendar_id?: string
          connected?: boolean
          family_id?: string
          last_synced_at?: string | null
          member_id?: string
          sync_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_links_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tokens: {
        Row: {
          access_token: string
          member_id: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          member_id: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          member_id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_entries: {
        Row: {
          created_at: string
          created_by: string | null
          doc_type: string | null
          expires_at: string | null
          family_id: string
          folder_id: string | null
          id: string
          note: string | null
          owner_member_id: string | null
          reference_no: string | null
          title: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          expires_at?: string | null
          family_id: string
          folder_id?: string | null
          id?: string
          note?: string | null
          owner_member_id?: string | null
          reference_no?: string | null
          title: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          expires_at?: string | null
          family_id?: string
          folder_id?: string | null
          id?: string
          note?: string | null
          owner_member_id?: string | null
          reference_no?: string | null
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_entries_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_entries_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_files: {
        Row: {
          created_at: string
          created_by: string | null
          drive_file_id: string | null
          drive_thumbnail_link: string | null
          drive_view_link: string | null
          entry_id: string
          family_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          storage_provider: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          drive_thumbnail_link?: string | null
          drive_view_link?: string | null
          entry_id: string
          family_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          storage_provider?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          drive_thumbnail_link?: string | null
          drive_view_link?: string | null
          entry_id?: string
          family_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          storage_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_files_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "doc_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_files_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_folders: {
        Row: {
          created_at: string
          drive_folder_id: string | null
          family_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          drive_folder_id?: string | null
          family_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string | null
          family_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_folders_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_links: {
        Row: {
          account_email: string | null
          connected: boolean
          connected_by_member_id: string | null
          family_id: string
          folder_path: string
          last_synced_at: string | null
          quota_bytes: number | null
          root_folder_id: string | null
          root_folder_link: string | null
          updated_at: string
          used_bytes: number | null
        }
        Insert: {
          account_email?: string | null
          connected?: boolean
          connected_by_member_id?: string | null
          family_id: string
          folder_path?: string
          last_synced_at?: string | null
          quota_bytes?: number | null
          root_folder_id?: string | null
          root_folder_link?: string | null
          updated_at?: string
          used_bytes?: number | null
        }
        Update: {
          account_email?: string | null
          connected?: boolean
          connected_by_member_id?: string | null
          family_id?: string
          folder_path?: string
          last_synced_at?: string | null
          quota_bytes?: number | null
          root_folder_id?: string | null
          root_folder_link?: string | null
          updated_at?: string
          used_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drive_links_connected_by_fkey"
            columns: ["connected_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_links_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_tokens: {
        Row: {
          access_token: string
          family_id: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          family_id: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          family_id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_tokens_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      member_locations: {
        Row: {
          accuracy_m: number | null
          created_at: string
          family_id: string
          lat: number | null
          lng: number | null
          member_id: string
          sharing: boolean
          updated_at: string | null
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          family_id: string
          lat?: number | null
          lng?: number | null
          member_id: string
          sharing?: boolean
          updated_at?: string | null
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          family_id?: string
          lat?: number | null
          lng?: number | null
          member_id?: string
          sharing?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_locations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_locations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          name: string
          note: string | null
          phone: string
          relationship: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          name: string
          note?: string | null
          phone: string
          relationship: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          name?: string
          note?: string | null
          phone?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_contacts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          event_id: string
          member_id: string
        }
        Insert: {
          event_id: string
          member_id: string
        }
        Update: {
          event_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          applies_to_whole_family: boolean
          budget_amount: number | null
          budget_currency: string | null
          created_at: string
          created_by: string | null
          drive_file_id: string | null
          drive_view_link: string | null
          end_date: string | null
          invite_url: string | null
          event_date: string
          family_id: string
          id: string
          journal_entry_id: string | null
          kind: string
          packed_count: number
          packed_total: number
          photo_storage_path: string | null
          recurs_yearly: boolean
          storage_provider: string
          sub_note: string | null
          title: string
        }
        Insert: {
          applies_to_whole_family?: boolean
          budget_amount?: number | null
          budget_currency?: string | null
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          drive_view_link?: string | null
          end_date?: string | null
          invite_url?: string | null
          event_date: string
          family_id: string
          id?: string
          journal_entry_id?: string | null
          kind: string
          packed_count?: number
          packed_total?: number
          photo_storage_path?: string | null
          recurs_yearly?: boolean
          storage_provider?: string
          sub_note?: string | null
          title: string
        }
        Update: {
          applies_to_whole_family?: boolean
          budget_amount?: number | null
          budget_currency?: string | null
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          drive_view_link?: string | null
          end_date?: string | null
          invite_url?: string | null
          event_date?: string
          family_id?: string
          id?: string
          journal_entry_id?: string | null
          kind?: string
          packed_count?: number
          packed_total?: number
          photo_storage_path?: string | null
          recurs_yearly?: boolean
          storage_provider?: string
          sub_note?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_poll_options: {
        Row: {
          family_id: string
          id: string
          label: string
          poll_id: string
          position: number
        }
        Insert: {
          family_id: string
          id?: string
          label: string
          poll_id: string
          position?: number
        }
        Update: {
          family_id?: string
          id?: string
          label?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_poll_options_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "family_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      family_poll_votes: {
        Row: {
          created_at: string
          family_id: string
          member_id: string
          option_id: string
          poll_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          member_id: string
          option_id: string
          poll_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          member_id?: string
          option_id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_poll_votes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_poll_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_poll_votes_option_of_poll"
            columns: ["poll_id", "option_id"]
            isOneToOne: false
            referencedRelation: "family_poll_options"
            referencedColumns: ["poll_id", "id"]
          },
          {
            foreignKeyName: "family_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "family_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      family_polls: {
        Row: {
          allow_multiple: boolean
          created_at: string
          family_id: string
          id: string
          message_id: string
          question: string
        }
        Insert: {
          allow_multiple?: boolean
          created_at?: string
          family_id: string
          id?: string
          message_id: string
          question: string
        }
        Update: {
          allow_multiple?: boolean
          created_at?: string
          family_id?: string
          id?: string
          message_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_polls_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "family_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          about: string | null
          access_expires_at: string | null
          access_source: string | null
          access_status: string
          background_url: string | null
          billing_customer_id: string | null
          billing_subscription_id: string | null
          country: string | null
          created_at: string
          currency: string
          date_format: string
          id: string
          invite_code: string
          name: string
          week_start: string
        }
        Insert: {
          about?: string | null
          access_expires_at?: string | null
          access_source?: string | null
          access_status?: string
          background_url?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: string
          invite_code: string
          name: string
          week_start?: string
        }
        Update: {
          about?: string | null
          access_expires_at?: string | null
          access_source?: string | null
          access_status?: string
          background_url?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: string
          invite_code?: string
          name?: string
          week_start?: string
        }
        Relationships: []
      }
      family_addresses: {
        Row: {
          address_line: string
          barangay: string | null
          building: string | null
          city: string | null
          country: string
          created_at: string
          family_id: string
          house_no: string | null
          id: string
          label: string
          province: string | null
          street: string | null
          zip_code: string | null
        }
        Insert: {
          address_line: string
          barangay?: string | null
          building?: string | null
          city?: string | null
          country?: string
          created_at?: string
          family_id: string
          house_no?: string | null
          id?: string
          label: string
          province?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line?: string
          barangay?: string | null
          building?: string | null
          city?: string | null
          country?: string
          created_at?: string
          family_id?: string
          house_no?: string | null
          id?: string
          label?: string
          province?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_addresses_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_backgrounds: {
        Row: {
          created_at: string
          drive_file_id: string | null
          family_id: string
          id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          family_id: string
          id?: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          family_id?: string
          id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_backgrounds_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_chat_pins: {
        Row: {
          family_id: string
          message_id: string
          pinned_at: string
          pinned_by: string
        }
        Insert: {
          family_id: string
          message_id: string
          pinned_at?: string
          pinned_by: string
        }
        Update: {
          family_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_chat_pins_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_chat_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "family_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_chat_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_link_messages: {
        Row: {
          author_name: string
          body: string
          created_at: string
          family_id: string
          id: string
          link_id: string
          member_id: string | null
        }
        Insert: {
          author_name?: string
          body: string
          created_at?: string
          family_id: string
          id?: string
          link_id: string
          member_id?: string | null
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          family_id?: string
          id?: string
          link_id?: string
          member_id?: string | null
        }
        Relationships: []
      }
      family_message_attachments: {
        Row: {
          created_at: string
          family_id: string
          file_name: string
          id: string
          message_id: string
          mime_type: string
          position: number
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          family_id: string
          file_name: string
          id?: string
          message_id: string
          mime_type: string
          position?: number
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          family_id?: string
          file_name?: string
          id?: string
          message_id?: string
          mime_type?: string
          position?: number
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_message_attachments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "family_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      family_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          family_id: string
          member_id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          family_id: string
          member_id: string
          message_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          family_id?: string
          member_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_message_reactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_message_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "family_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      family_message_reads: {
        Row: {
          family_id: string
          last_read_at: string
          member_id: string
        }
        Insert: {
          family_id: string
          last_read_at?: string
          member_id: string
        }
        Update: {
          family_id?: string
          last_read_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_message_reads_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_message_reads_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_messages: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          family_id: string
          id: string
          member_id: string | null
          mentions: string[]
          reply_to: string | null
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          family_id: string
          id?: string
          member_id?: string | null
          mentions?: string[]
          reply_to?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          family_id?: string
          id?: string
          member_id?: string | null
          mentions?: string[]
          reply_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_messages_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_recipe_categories: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          key: string
          label: string
          plate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          key: string
          label: string
          plate?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          key?: string
          label?: string
          plate?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_recipe_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_recipe_categories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_recipe_ingredients: {
        Row: {
          family_id: string
          id: string
          item_key: string
          name: string
          position: number
          qty: number | null
          recipe_id: string
          section: string
          unit: string | null
        }
        Insert: {
          family_id: string
          id?: string
          item_key: string
          name: string
          position?: number
          qty?: number | null
          recipe_id: string
          section?: string
          unit?: string | null
        }
        Update: {
          family_id?: string
          id?: string
          item_key?: string
          name?: string
          position?: number
          qty?: number | null
          recipe_id?: string
          section?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_recipe_ingredients_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "family_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      family_recipes: {
        Row: {
          base_key: string | null
          categories: string[]
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          minutes: number | null
          name: string
          serves: number
          slots: string[]
          steps: string[]
          updated_at: string
        }
        Insert: {
          base_key?: string | null
          categories?: string[]
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          minutes?: number | null
          name: string
          serves?: number
          slots?: string[]
          steps?: string[]
          updated_at?: string
        }
        Update: {
          base_key?: string | null
          categories?: string[]
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          minutes?: number | null
          name?: string
          serves?: number
          slots?: string[]
          steps?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_recipes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_tree_matches: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          id: string
          offer_family_id: string
          offer_person_id: string
          offered_at: string
          offered_by: string | null
          status: string
          to_family_id: string
          to_person_id: string | null
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          offer_family_id: string
          offer_person_id: string
          offered_at?: string
          offered_by?: string | null
          status?: string
          to_family_id: string
          to_person_id?: string | null
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          offer_family_id?: string
          offer_person_id?: string
          offered_at?: string
          offered_by?: string | null
          status?: string
          to_family_id?: string
          to_person_id?: string | null
        }
        Relationships: []
      }
      family_tree_people: {
        Row: {
          created_at: string
          created_by: string | null
          dob: string | null
          family_id: string
          father_id: string | null
          full_name: string | null
          id: string
          member_id: string | null
          mother_id: string | null
          notes: string | null
          spouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dob?: string | null
          family_id: string
          father_id?: string | null
          full_name?: string | null
          id?: string
          member_id?: string | null
          mother_id?: string | null
          notes?: string | null
          spouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dob?: string | null
          family_id?: string
          father_id?: string | null
          full_name?: string | null
          id?: string
          member_id?: string | null
          mother_id?: string | null
          notes?: string | null
          spouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_tree_people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tree_people_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tree_people_father_id_fkey"
            columns: ["father_id"]
            isOneToOne: false
            referencedRelation: "family_tree_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tree_people_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tree_people_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "family_tree_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tree_people_spouse_id_fkey"
            columns: ["spouse_id"]
            isOneToOne: false
            referencedRelation: "family_tree_people"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          current_amount: number
          family_id: string
          id: string
          is_joint: boolean
          linked_account_id: string | null
          owner_member_id: string | null
          sub_note: string | null
          target_amount: number | null
          target_date: string | null
          target_unit: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_amount?: number
          family_id: string
          id?: string
          is_joint?: boolean
          linked_account_id?: string | null
          owner_member_id?: string | null
          sub_note?: string | null
          target_amount?: number | null
          target_date?: string | null
          target_unit?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_amount?: number
          family_id?: string
          id?: string
          is_joint?: boolean
          linked_account_id?: string | null
          owner_member_id?: string | null
          sub_note?: string | null
          target_amount?: number | null
          target_date?: string | null
          target_unit?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_linked_account_fk"
            columns: ["linked_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      health_appointments: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id: string
          what: string
          when_at: string
          where_text: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id: string
          what: string
          when_at: string
          where_text?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string
          what?: string
          when_at?: string
          where_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_appointments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_appointments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      health_condition_entries: {
        Row: {
          condition_id: string
          created_at: string
          created_by: string | null
          entry_date: string
          family_id: string
          id: string
          note: string
        }
        Insert: {
          condition_id: string
          created_at?: string
          created_by?: string | null
          entry_date: string
          family_id: string
          id?: string
          note: string
        }
        Update: {
          condition_id?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          family_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_condition_entries_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "health_conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_condition_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_condition_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      health_conditions: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id: string
          meta_note: string | null
          name: string
          status: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id: string
          meta_note?: string | null
          name: string
          status?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string
          meta_note?: string | null
          name?: string
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_conditions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_conditions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_conditions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      health_labs: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string | null
          family_id: string
          flag: string | null
          id: string
          member_id: string
          name: string
          result: string | null
          tag_class: string | null
          test_date: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          family_id: string
          flag?: string | null
          id?: string
          member_id: string
          name: string
          result?: string | null
          tag_class?: string | null
          test_date: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          family_id?: string
          flag?: string | null
          id?: string
          member_id?: string
          name?: string
          result?: string | null
          tag_class?: string | null
          test_date?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_labs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_labs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "doc_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_labs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_labs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      health_schedule: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id: string
          status: string
          what: string
          when_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id: string
          status?: string
          what: string
          when_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string
          status?: string
          what?: string
          when_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_schedule_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_schedule_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_schedule_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      health_vitals: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id: string
          reading_date: string
          source: string
          unit: string
          value_text: string
          visibility: string
          vital_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id: string
          reading_date: string
          source?: string
          unit: string
          value_text: string
          visibility?: string
          vital_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string
          reading_date?: string
          source?: string
          unit?: string
          value_text?: string
          visibility?: string
          vital_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_vitals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_vitals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_vitals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      income_schedules: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          is_joint: boolean
          name: string
          next_date: string | null
          owner_member_id: string | null
          received_at: string | null
          received_by_member_id: string | null
          recurrence: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          is_joint?: boolean
          name: string
          next_date?: string | null
          owner_member_id?: string | null
          received_at?: string | null
          received_by_member_id?: string | null
          recurrence?: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          is_joint?: boolean
          name?: string
          next_date?: string | null
          owner_member_id?: string | null
          received_at?: string | null
          received_by_member_id?: string | null
          recurrence?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_schedules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_schedules_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_schedules_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_schedules_received_by_member_id_fkey"
            columns: ["received_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_schedules_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "wealth_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_comments: {
        Row: {
          body: string
          created_at: string
          entry_id: string
          family_id: string
          id: string
          member_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          entry_id: string
          family_id: string
          id?: string
          member_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          entry_id?: string
          family_id?: string
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_comments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_links: {
        Row: {
          addressee_family_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          requested_at: string
          requested_by: string | null
          requester_family_id: string
          status: string
        }
        Insert: {
          addressee_family_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_at?: string
          requested_by?: string | null
          requester_family_id: string
          status?: string
        }
        Update: {
          addressee_family_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_at?: string
          requested_by?: string | null
          requester_family_id?: string
          status?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          family_id: string
          id: string
          note: string | null
          shared_at: string | null
          source: string
          source_activity_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date: string
          family_id: string
          id?: string
          note?: string | null
          shared_at?: string | null
          source?: string
          source_activity_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          family_id?: string
          id?: string
          note?: string | null
          shared_at?: string | null
          source?: string
          source_activity_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_media: {
        Row: {
          entry_id: string
          media_id: string
          sort_order: number
        }
        Insert: {
          entry_id: string
          media_id: string
          sort_order?: number
        }
        Update: {
          entry_id?: string
          media_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_media_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "journal_media"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_people: {
        Row: {
          entry_id: string
          member_id: string
        }
        Insert: {
          entry_id: string
          member_id: string
        }
        Update: {
          entry_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_people_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_people_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_media: {
        Row: {
          created_at: string
          drive_file_id: string | null
          drive_thumbnail_link: string | null
          drive_view_link: string | null
          family_id: string
          id: string
          media_type: string
          storage_path: string | null
          storage_provider: string
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          drive_thumbnail_link?: string | null
          drive_view_link?: string | null
          family_id: string
          id?: string
          media_type?: string
          storage_path?: string | null
          storage_provider?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          drive_thumbnail_link?: string | null
          drive_view_link?: string | null
          family_id?: string
          id?: string
          media_type?: string
          storage_path?: string | null
          storage_provider?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_media_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          balance: number
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          is_joint: boolean
          kind: string
          lender: string | null
          linked_account_id: string | null
          monthly_payment: number | null
          name: string
          note: string | null
          owner_member_id: string | null
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          is_joint?: boolean
          kind?: string
          lender?: string | null
          linked_account_id?: string | null
          monthly_payment?: number | null
          name: string
          note?: string | null
          owner_member_id?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          is_joint?: boolean
          kind?: string
          lender?: string | null
          linked_account_id?: string | null
          monthly_payment?: number | null
          name?: string
          note?: string | null
          owner_member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liabilities_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liabilities_linked_account_id_fkey"
            columns: ["linked_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liabilities_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      liquid_intake_log: {
        Row: {
          family_id: string
          glasses: number
          id: string
          log_date: string
          member_id: string
          type: string
          updated_at: string
        }
        Insert: {
          family_id: string
          glasses?: number
          id?: string
          log_date: string
          member_id: string
          type: string
          updated_at?: string
        }
        Update: {
          family_id?: string
          glasses?: number
          id?: string
          log_date?: string
          member_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquid_intake_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquid_intake_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_ingredients: {
        Row: {
          family_id: string
          id: string
          ingredient_name: string
          item_key: string | null
          meal_plan_id: string
          qty: string | null
          qty_amount: number | null
          section: string | null
          unit: string | null
        }
        Insert: {
          family_id: string
          id?: string
          ingredient_name: string
          item_key?: string | null
          meal_plan_id: string
          qty?: string | null
          qty_amount?: number | null
          section?: string | null
          unit?: string | null
        }
        Update: {
          family_id?: string
          id?: string
          ingredient_name?: string
          item_key?: string | null
          meal_plan_id?: string
          qty?: string | null
          qty_amount?: number | null
          section?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_ingredients_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_ingredients_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_members: {
        Row: {
          created_at: string
          family_id: string
          meal_plan_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          meal_plan_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          meal_plan_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_members_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          created_by: string | null
          dish: string
          family_id: string
          family_recipe_id: string | null
          id: string
          note: string | null
          plan_date: string
          position: number
          recipe_key: string | null
          slot: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dish: string
          family_id: string
          family_recipe_id?: string | null
          id?: string
          note?: string | null
          plan_date: string
          position?: number
          recipe_key?: string | null
          slot?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dish?: string
          family_id?: string
          family_recipe_id?: string | null
          id?: string
          note?: string | null
          plan_date?: string
          position?: number
          recipe_key?: string | null
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_family_recipe_id_fkey"
            columns: ["family_recipe_id"]
            isOneToOne: false
            referencedRelation: "family_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      member_avatars: {
        Row: {
          created_at: string
          drive_file_id: string | null
          family_id: string
          id: string
          member_id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          family_id: string
          id?: string
          member_id: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          family_id?: string
          id?: string
          member_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_avatars_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_avatars_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_security: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          member_id: string
          pin_hash: string | null
          pin_salt: string | null
          pin_set_at: string | null
          unlock_expires_at: string | null
          unlock_token_hash: string | null
          updated_at: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          member_id: string
          pin_hash?: string | null
          pin_salt?: string | null
          pin_set_at?: string | null
          unlock_expires_at?: string | null
          unlock_token_hash?: string | null
          updated_at?: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          member_id?: string
          pin_hash?: string | null
          pin_salt?: string | null
          pin_set_at?: string | null
          unlock_expires_at?: string | null
          unlock_token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_security_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_webauthn_credentials: {
        Row: {
          alg: number
          created_at: string
          credential_id: string
          id: string
          label: string | null
          last_used_at: string | null
          member_id: string
          public_key: string
          sign_count: number
        }
        Insert: {
          alg: number
          created_at?: string
          credential_id: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          member_id: string
          public_key: string
          sign_count?: number
        }
        Update: {
          alg?: number
          created_at?: string
          credential_id?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          member_id?: string
          public_key?: string
          sign_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_webauthn_credentials_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          color: string | null
          created_at: string
          dob: string | null
          email: string | null
          employer_name: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          family_id: string
          full_name: string
          height: string | null
          high_school: string | null
          id: string
          insurance_info: string | null
          is_organiser: boolean
          mobile: string | null
          notification_prefs: Json
          pagibig_number: string | null
          pants_size: string | null
          philhealth_number: string | null
          physician_name: string | null
          place_of_birth: string | null
          relationship: string | null
          role: string
          shoe_size: string | null
          sss_number: string | null
          status: string
          text_scale: number
          text_size: string
          theme: string
          tin_number: string | null
          tshirt_size: string | null
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        Insert: {
          allergies?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          blood_type?: string | null
          college?: string | null
          color?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          employer_name?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          family_id: string
          full_name: string
          height?: string | null
          high_school?: string | null
          id?: string
          insurance_info?: string | null
          is_organiser?: boolean
          mobile?: string | null
          notification_prefs?: Json
          pagibig_number?: string | null
          pants_size?: string | null
          philhealth_number?: string | null
          physician_name?: string | null
          place_of_birth?: string | null
          relationship?: string | null
          role: string
          shoe_size?: string | null
          sss_number?: string | null
          status?: string
          text_scale?: number
          text_size?: string
          theme?: string
          tin_number?: string | null
          tshirt_size?: string | null
          weight?: string | null
          work_contact_info?: string | null
          work_email?: string | null
        }
        Update: {
          allergies?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          blood_type?: string | null
          college?: string | null
          color?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          employer_name?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          family_id?: string
          full_name?: string
          height?: string | null
          high_school?: string | null
          id?: string
          insurance_info?: string | null
          is_organiser?: boolean
          mobile?: string | null
          notification_prefs?: Json
          pagibig_number?: string | null
          pants_size?: string | null
          philhealth_number?: string | null
          physician_name?: string | null
          place_of_birth?: string | null
          relationship?: string | null
          role?: string
          shoe_size?: string | null
          sss_number?: string | null
          status?: string
          text_scale?: number
          text_size?: string
          theme?: string
          tin_number?: string | null
          tshirt_size?: string | null
          weight?: string | null
          work_contact_info?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id: string | null
          milestone_date: string
          shared_at: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id?: string | null
          milestone_date: string
          shared_at?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string | null
          milestone_date?: string
          shared_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      omron_links: {
        Row: {
          connected: boolean
          family_id: string
          last_synced_at: string | null
          member_id: string
          updated_at: string
        }
        Insert: {
          connected?: boolean
          family_id: string
          last_synced_at?: string | null
          member_id: string
          updated_at?: string
        }
        Update: {
          connected?: boolean
          family_id?: string
          last_synced_at?: string | null
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omron_links_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omron_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          family_id: string
          id: string
          item_key: string
          name: string
          note: string | null
          quantity: number | null
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          family_id: string
          id?: string
          item_key: string
          name: string
          note?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          family_id?: string
          id?: string
          item_key?: string
          name?: string
          note?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list: {
        Row: {
          family_id: string
          id: string
          item_key: string
          name: string
          note: string | null
          section: string
          unit: string
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          family_id: string
          id?: string
          item_key: string
          name: string
          note?: string | null
          section?: string
          unit?: string
          unit_price: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          family_id?: string
          id?: string
          item_key?: string
          name?: string
          note?: string | null
          section?: string
          unit?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_photos: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          recipe_ref: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          recipe_ref: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          recipe_ref?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_photos_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          cost_points: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          family_id: string
          id: string
          member_id: string
          reward_id: string
          status: string
        }
        Insert: {
          cost_points: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id: string
          id?: string
          member_id: string
          reward_id: string
          status?: string
        }
        Update: {
          cost_points?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id?: string
          id?: string
          member_id?: string
          reward_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          cost_points: number
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          title: string
        }
        Insert: {
          active?: boolean
          cost_points: number
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          title: string
        }
        Update: {
          active?: boolean
          cost_points?: number
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          file_name: string
          id: string
          mime_type: string | null
          routine_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          routine_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          routine_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_attachments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_attachments_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_log: {
        Row: {
          amount: number | null
          family_id: string
          id: string
          logged_at: string
          approval: string
          approved_at: string | null
          approved_by: string | null
          logged_by: string | null
          member_id: string | null
          note: string | null
          occurrence_date: string
          routine_id: string
          status: string
        }
        Insert: {
          amount?: number | null
          family_id: string
          id?: string
          logged_at?: string
          approval?: string
          approved_at?: string | null
          approved_by?: string | null
          logged_by?: string | null
          member_id?: string | null
          note?: string | null
          occurrence_date: string
          routine_id: string
          status: string
        }
        Update: {
          amount?: number | null
          family_id?: string
          id?: string
          logged_at?: string
          approval?: string
          approved_at?: string | null
          approved_by?: string | null
          logged_by?: string | null
          member_id?: string | null
          note?: string | null
          occurrence_date?: string
          routine_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_log_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_log_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_log_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_members: {
        Row: {
          member_id: string
          position: number
          routine_id: string
        }
        Insert: {
          member_id: string
          position?: number
          routine_id: string
        }
        Update: {
          member_id?: string
          position?: number
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_members_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          applies_to_whole_family: boolean
          bymonthday: number | null
          byweekday: number[]
          cost_account_id: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          end_date: string | null
          expected_cost: number | null
          expense_category: string | null
          family_id: string
          freq: string
          id: string
          kind: string
          location: string | null
          notes: string | null
          paused: boolean
          points: number
          reminder_minutes: number | null
          repeat_interval: number
          rotate_assignee: boolean
          start_date: string
          time_of_day: string | null
          title: string
        }
        Insert: {
          applies_to_whole_family?: boolean
          bymonthday?: number | null
          byweekday?: number[]
          cost_account_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          end_date?: string | null
          expected_cost?: number | null
          expense_category?: string | null
          family_id: string
          freq: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          paused?: boolean
          points?: number
          reminder_minutes?: number | null
          repeat_interval?: number
          rotate_assignee?: boolean
          start_date: string
          time_of_day?: string | null
          title: string
        }
        Update: {
          applies_to_whole_family?: boolean
          bymonthday?: number | null
          byweekday?: number[]
          cost_account_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          end_date?: string | null
          expected_cost?: number | null
          expense_category?: string | null
          family_id?: string
          freq?: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          paused?: boolean
          points?: number
          reminder_minutes?: number | null
          repeat_interval?: number
          rotate_assignee?: boolean
          start_date?: string
          time_of_day?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "routines_cost_account_id_fkey"
            columns: ["cost_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_travellers: {
        Row: {
          member_id: string
          trip_id: string
        }
        Insert: {
          member_id: string
          trip_id: string
        }
        Update: {
          member_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_travellers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travellers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          applies_to_whole_family: boolean
          budget_amount: number | null
          created_at: string
          created_by: string | null
          drive_file_id: string | null
          drive_view_link: string | null
          end_date: string | null
          family_id: string
          id: string
          journal_entry_id: string | null
          packed_count: number
          packed_total: number
          photo_storage_path: string | null
          start_date: string
          storage_provider: string
          title: string
        }
        Insert: {
          applies_to_whole_family?: boolean
          budget_amount?: number | null
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          drive_view_link?: string | null
          end_date?: string | null
          family_id: string
          id?: string
          journal_entry_id?: string | null
          packed_count?: number
          packed_total?: number
          photo_storage_path?: string | null
          start_date: string
          storage_provider?: string
          title: string
        }
        Update: {
          applies_to_whole_family?: boolean
          budget_amount?: number | null
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          drive_view_link?: string | null
          end_date?: string | null
          family_id?: string
          id?: string
          journal_entry_id?: string | null
          packed_count?: number
          packed_total?: number
          photo_storage_path?: string | null
          start_date?: string
          storage_provider?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wealth_targets: {
        Row: {
          family_id: string
          id: string
          member_id: string
          period_month: number
          period_year: number
          target_amount: number
        }
        Insert: {
          family_id: string
          id?: string
          member_id: string
          period_month: number
          period_year: number
          target_amount: number
        }
        Update: {
          family_id?: string
          id?: string
          member_id?: string
          period_month?: number
          period_year?: number
          target_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "wealth_targets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wealth_targets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      wealth_transactions: {
        Row: {
          account_id: string
          amount: number
          category: string | null
          created_at: string
          direction: string
          family_id: string
          goal_id: string | null
          id: string
          occurred_at: string
          particulars: string
          recorded_by: string | null
          source_id: string | null
          source_table: string | null
          status: string
          transfer_group_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category?: string | null
          created_at?: string
          direction: string
          family_id: string
          goal_id?: string | null
          id?: string
          occurred_at?: string
          particulars: string
          recorded_by?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          transfer_group_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string | null
          created_at?: string
          direction?: string
          family_id?: string
          goal_id?: string | null
          id?: string
          occurred_at?: string
          particulars?: string
          recorded_by?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          transfer_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wealth_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wealth_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wealth_transactions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wealth_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      offer_tree_person: {
        Args: { person: string; to_family: string }
        Returns: string
      }
      respond_tree_offer: {
        Args: { match: string; accept: boolean; their_person?: string | null }
        Returns: string | null
      }
      shared_branch: {
        Args: { match: string }
        Returns: {
          id: string
          full_name: string
          birth_year: string | null
          father_id: string | null
          mother_id: string | null
          spouse_id: string | null
          is_shared_person: boolean
        }[]
      }
      tree_offers_for_me: {
        Args: Record<PropertyKey, never>
        Returns: {
          match_id: string
          from_family_name: string
          full_name: string
          birth_year: string | null
          status: string
        }[]
      }
      withdraw_tree_match: {
        Args: { match: string }
        Returns: undefined
      }
      request_family_link: {
        Args: { code: string }
        Returns: string
      }
      respond_family_link: {
        Args: { link_id: string; accept: boolean }
        Returns: undefined
      }
      revoke_family_link: {
        Args: { link_id: string }
        Returns: undefined
      }
      activate_household_subscription: {
        Args: {
          p_customer_id: string
          p_family_id: string
          p_period_end: string
          p_subscription_id: string
        }
        Returns: undefined
      }
      add_child_with_login: {
        Args: {
          p_auth_user_id: string
          p_dob: string
          p_full_name: string
          p_relationship: string
        }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          created_at: string
          dob: string | null
          email: string | null
          employer_name: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          family_id: string
          full_name: string
          height: string | null
          high_school: string | null
          id: string
          insurance_info: string | null
          is_organiser: boolean
          mobile: string | null
          notification_prefs: Json
          pagibig_number: string | null
          pants_size: string | null
          philhealth_number: string | null
          physician_name: string | null
          place_of_birth: string | null
          relationship: string | null
          role: string
          shoe_size: string | null
          sss_number: string | null
          status: string
          text_size: string
          theme: string
          tin_number: string | null
          tshirt_size: string | null
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_managed_child: {
        Args: { p_dob: string; p_full_name: string; p_relationship?: string }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          created_at: string
          dob: string | null
          email: string | null
          employer_name: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          family_id: string
          full_name: string
          height: string | null
          high_school: string | null
          id: string
          insurance_info: string | null
          is_organiser: boolean
          mobile: string | null
          notification_prefs: Json
          pagibig_number: string | null
          pants_size: string | null
          philhealth_number: string | null
          physician_name: string | null
          place_of_birth: string | null
          relationship: string | null
          role: string
          shoe_size: string | null
          sss_number: string | null
          status: string
          text_size: string
          theme: string
          tin_number: string | null
          tshirt_size: string | null
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_code_grant_to_family: { Args: { p_code: string }; Returns: string }
      attach_login_to_child: {
        Args: { p_auth_user_id: string; p_member_id: string }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          created_at: string
          dob: string | null
          email: string | null
          employer_name: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          family_id: string
          full_name: string
          height: string | null
          high_school: string | null
          id: string
          insurance_info: string | null
          is_organiser: boolean
          mobile: string | null
          notification_prefs: Json
          pagibig_number: string | null
          pants_size: string | null
          philhealth_number: string | null
          physician_name: string | null
          place_of_birth: string | null
          relationship: string | null
          role: string
          shoe_size: string | null
          sss_number: string | null
          status: string
          text_size: string
          theme: string
          tin_number: string | null
          tshirt_size: string | null
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_family: {
        Args: {
          p_dob?: string
          p_full_name: string
          p_household_name: string
          p_mobile?: string
        }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          created_at: string
          dob: string | null
          email: string | null
          employer_name: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          family_id: string
          full_name: string
          height: string | null
          high_school: string | null
          id: string
          insurance_info: string | null
          is_organiser: boolean
          mobile: string | null
          notification_prefs: Json
          pagibig_number: string | null
          pants_size: string | null
          philhealth_number: string | null
          physician_name: string | null
          place_of_birth: string | null
          relationship: string | null
          role: string
          shoe_size: string | null
          sss_number: string | null
          status: string
          text_size: string
          theme: string
          tin_number: string | null
          tshirt_size: string | null
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_family_id: { Args: never; Returns: string }
      current_member_id: { Args: never; Returns: string }
      current_member_is_organiser: { Args: never; Returns: boolean }
      current_member_role: { Args: never; Returns: string }
      delete_household: { Args: never; Returns: undefined }
      generate_invite_code: { Args: never; Returns: string }
      join_family: {
        Args: {
          p_dob?: string
          p_full_name: string
          p_invite_code: string
          p_mobile?: string
          p_role?: string
        }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          created_at: string
          dob: string | null
          email: string | null
          employer_name: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          family_id: string
          full_name: string
          height: string | null
          high_school: string | null
          id: string
          insurance_info: string | null
          is_organiser: boolean
          mobile: string | null
          notification_prefs: Json
          pagibig_number: string | null
          pants_size: string | null
          philhealth_number: string | null
          physician_name: string | null
          place_of_birth: string | null
          relationship: string | null
          role: string
          shoe_size: string | null
          sss_number: string | null
          status: string
          text_size: string
          theme: string
          tin_number: string | null
          tshirt_size: string | null
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_household_self: { Args: never; Returns: undefined }
      recalc_goal_total: { Args: { p_goal_id: string }; Returns: number }
      redeem_code_for_household: { Args: { p_code: string }; Returns: string }
      redeem_household_code: { Args: { p_code: string }; Returns: boolean }
      regenerate_invite_code: { Args: never; Returns: string }
      set_household_access_status: {
        Args: { p_family_id: string; p_period_end?: string; p_status: string }
        Returns: undefined
      }
      signup_code_is_valid: { Args: { p_code: string }; Returns: boolean }
      transfer_organiser_role: {
        Args: { p_new_organiser_member_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
