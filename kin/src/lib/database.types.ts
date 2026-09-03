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
      accounts: {
        Row: {
          balance: number
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          is_joint: boolean
          name: string
          owner_member_id: string | null
          sub_note: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          is_joint?: boolean
          name: string
          owner_member_id?: string | null
          sub_note?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          is_joint?: boolean
          name?: string
          owner_member_id?: string | null
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
          created_at: string
          created_by: string | null
          end_at: string | null
          family_id: string
          id: string
          location: string | null
          notes: string | null
          repeat: string
          start_at: string
          status: string
          title: string
        }
        Insert: {
          applies_to_whole_family?: boolean
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          family_id: string
          id?: string
          location?: string | null
          notes?: string | null
          repeat?: string
          start_at: string
          status?: string
          title: string
        }
        Update: {
          applies_to_whole_family?: boolean
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          family_id?: string
          id?: string
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
          recurrence: string | null
          status: string
          sub_note: string | null
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
          recurrence?: string | null
          status?: string
          sub_note?: string | null
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
          recurrence?: string | null
          status?: string
          sub_note?: string | null
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
          spent_amount: number
        }
        Insert: {
          budget_amount: number
          family_id: string
          id?: string
          period_month: number
          period_year: number
          spent_amount?: number
        }
        Update: {
          budget_amount?: number
          family_id?: string
          id?: string
          period_month?: number
          period_year?: number
          spent_amount?: number
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
          created_at: string
          created_by: string | null
          family_id: string
          group_name: string
          id: string
          member_id: string | null
          name: string
          qty: string | null
          source: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          cleared?: boolean
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          family_id: string
          group_name: string
          id?: string
          member_id?: string | null
          name: string
          qty?: string | null
          source: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          cleared?: boolean
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          group_name?: string
          id?: string
          member_id?: string | null
          name?: string
          qty?: string | null
          source?: string
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
      events: {
        Row: {
          created_at: string
          created_by: string | null
          event_date: string
          family_id: string
          id: string
          kind: string
          recurs_yearly: boolean
          sub_note: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_date: string
          family_id: string
          id?: string
          kind: string
          recurs_yearly?: boolean
          sub_note?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          family_id?: string
          id?: string
          kind?: string
          recurs_yearly?: boolean
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
            foreignKeyName: "events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          about: string | null
          background_url: string | null
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
          background_url?: string | null
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
          background_url?: string | null
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
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          family_id: string
          id: string
          note: string | null
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
      meal_ingredients: {
        Row: {
          family_id: string
          id: string
          ingredient_name: string
          meal_plan_id: string
          qty: string | null
        }
        Insert: {
          family_id: string
          id?: string
          ingredient_name: string
          meal_plan_id: string
          qty?: string | null
        }
        Update: {
          family_id?: string
          id?: string
          ingredient_name?: string
          meal_plan_id?: string
          qty?: string | null
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
      meal_plans: {
        Row: {
          created_at: string
          created_by: string | null
          dish: string
          family_id: string
          id: string
          note: string | null
          plan_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dish: string
          family_id: string
          id?: string
          note?: string | null
          plan_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dish?: string
          family_id?: string
          id?: string
          note?: string | null
          plan_date?: string
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
      members: {
        Row: {
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
        Insert: {
          allergies?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          blood_type?: string | null
          college?: string | null
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
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id?: string | null
          milestone_date: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id?: string | null
          milestone_date?: string
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
          current_amount: number
          family_id: string
          id: string
          member_id: string
          period_month: number
          period_year: number
          target_amount: number
        }
        Insert: {
          current_amount?: number
          family_id: string
          id?: string
          member_id: string
          period_month: number
          period_year: number
          target_amount: number
        }
        Update: {
          current_amount?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      regenerate_invite_code: { Args: never; Returns: string }
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
