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
      storage_sweep: {
        Row: { bucket: string; path: string; queued_at: string }
        Insert: { bucket: string; path: string; queued_at?: string }
        Update: { bucket?: string; path?: string; queued_at?: string }
        Relationships: []
      }
      time_capsules: {
        Row: {
          body: string
          created_at: string
          family_id: string
          id: string
          notified_at: string | null
          occasion: string
          open_to_sign: boolean
          opens_on: string | null
          open_when: string | null
          opened_at: string | null
          recipient_member_id: string
          reply_to: string | null
          title: string
          writer_member_id: string | null
          writer_name: string
        }
        Insert: {
          body: string
          created_at?: string
          family_id?: string
          id?: string
          notified_at?: string | null
          occasion?: string
          open_to_sign?: boolean
          opens_on?: string | null
          open_when?: string | null
          opened_at?: string | null
          recipient_member_id: string
          reply_to?: string | null
          title?: string
          writer_member_id?: string | null
          writer_name?: string
        }
        Update: {
          body?: string
          created_at?: string
          family_id?: string
          id?: string
          notified_at?: string | null
          occasion?: string
          open_to_sign?: boolean
          opens_on?: string | null
          open_when?: string | null
          opened_at?: string | null
          recipient_member_id?: string
          reply_to?: string | null
          title?: string
          writer_member_id?: string | null
          writer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_capsules_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_capsules_recipient_member_id_fkey"
            columns: ["recipient_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_capsules_writer_member_id_fkey"
            columns: ["writer_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      household_helpers: {
        Row: {
          can_see_kids_plans: boolean
          can_see_list: boolean
          can_see_meals: boolean
          claimed_at: string | null
          created_at: string
          display_name: string
          family_id: string
          id: string
          invite_code: string | null
          invite_expires_at: string | null
          invited_by: string | null
          removed_at: string | null
          user_id: string | null
        }
        Insert: {
          can_see_kids_plans?: boolean
          can_see_list?: boolean
          can_see_meals?: boolean
          claimed_at?: string | null
          created_at?: string
          display_name: string
          family_id: string
          id?: string
          invite_code?: string | null
          invite_expires_at?: string | null
          invited_by?: string | null
          removed_at?: string | null
          user_id?: string | null
        }
        Update: {
          can_see_kids_plans?: boolean
          can_see_list?: boolean
          can_see_meals?: boolean
          claimed_at?: string | null
          created_at?: string
          display_name?: string
          family_id?: string
          id?: string
          invite_code?: string | null
          invite_expires_at?: string | null
          invited_by?: string | null
          removed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_helpers_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_helpers_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      household_special_days: {
        Row: {
          created_at: string
          created_by: string | null
          day: string
          family_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day: string
          family_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day?: string
          family_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_special_days_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_special_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_person_stories: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          family_id: string
          happened_on: string | null
          happened_precision: string
          id: string
          person_id: string
          shared_at: string | null
          title: string
          told_by_member_id: string | null
          told_by_name: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          family_id: string
          happened_on?: string | null
          happened_precision?: string
          id?: string
          person_id: string
          shared_at?: string | null
          title: string
          told_by_member_id?: string | null
          told_by_name?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          happened_on?: string | null
          happened_precision?: string
          id?: string
          person_id?: string
          shared_at?: string | null
          title?: string
          told_by_member_id?: string | null
          told_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_person_stories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_person_stories_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "family_tree_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_person_stories_told_by_member_id_fkey"
            columns: ["told_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_person_stories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_person_story_files: {
        Row: {
          created_at: string
          duration_seconds: number | null
          family_id: string
          file_name: string
          id: string
          mime_type: string
          position: number
          storage_path: string
          story_id: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          family_id: string
          file_name?: string
          id?: string
          mime_type: string
          position?: number
          storage_path: string
          story_id: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          family_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          position?: number
          storage_path?: string
          story_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tree_person_story_files_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "tree_person_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_person_story_files_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          created_at: string
          duration_seconds: number | null
          expires_at: string
          family_id: string
          id: string
          media_type: string
          member_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          family_id: string
          id?: string
          media_type: string
          member_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          family_id?: string
          id?: string
          media_type?: string
          member_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
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
      account_numbers: {
        Row: {
          account_id: string
          family_id: string
          number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          family_id: string
          number: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          family_id?: string
          number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_numbers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_numbers_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_numbers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      account_viewers: {
        Row: {
          account_id: string
          added_by: string | null
          created_at: string
          family_id: string
          member_id: string
        }
        Insert: {
          account_id: string
          added_by?: string | null
          created_at?: string
          family_id: string
          member_id: string
        }
        Update: {
          account_id?: string
          added_by?: string | null
          created_at?: string
          family_id?: string
          member_id?: string
        }
        Relationships: []
      }
      alkansya_entries: {
        Row: {
          amount: number
          created_at: string
          family_id: string
          id: string
          jar: string
          kind: string
          member_id: string
          note: string | null
          occurred_on: string
          points: number
          recorded_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          family_id: string
          id?: string
          jar: string
          kind: string
          member_id: string
          note?: string | null
          occurred_on?: string
          points?: number
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          family_id?: string
          id?: string
          jar?: string
          kind?: string
          member_id?: string
          note?: string | null
          occurred_on?: string
          points?: number
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alkansya_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alkansya_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alkansya_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      alkansya_plans: {
        Row: {
          active: boolean
          bigay_pct: number
          created_at: string
          created_by: string | null
          family_id: string
          gastos_pct: number
          interest_pct: number
          ipon_pct: number
          member_id: string
          paid_through: string | null
          pay_weekday: number
          peso_per_point: number
          updated_at: string
          weekly_amount: number
        }
        Insert: {
          active?: boolean
          bigay_pct?: number
          created_at?: string
          created_by?: string | null
          family_id: string
          gastos_pct?: number
          interest_pct?: number
          ipon_pct?: number
          member_id: string
          paid_through?: string | null
          pay_weekday?: number
          peso_per_point?: number
          updated_at?: string
          weekly_amount?: number
        }
        Update: {
          active?: boolean
          bigay_pct?: number
          created_at?: string
          created_by?: string | null
          family_id?: string
          gastos_pct?: number
          interest_pct?: number
          ipon_pct?: number
          member_id?: string
          paid_through?: string | null
          pay_weekday?: number
          peso_per_point?: number
          updated_at?: string
          weekly_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "alkansya_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alkansya_plans_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alkansya_plans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      paluwagan_groups: {
        Row: {
          contribution: number
          created_at: string
          family_id: string
          frequency: string
          id: string
          is_private: boolean
          name: string
          note: string | null
          recorded_by: string | null
          remind: boolean
          starts_on: string
        }
        Insert: {
          contribution: number
          created_at?: string
          family_id: string
          frequency?: string
          id?: string
          is_private?: boolean
          name: string
          note?: string | null
          recorded_by?: string | null
          remind?: boolean
          starts_on: string
        }
        Update: {
          contribution?: number
          created_at?: string
          family_id?: string
          frequency?: string
          id?: string
          is_private?: boolean
          name?: string
          note?: string | null
          recorded_by?: string | null
          remind?: boolean
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "paluwagan_groups_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paluwagan_groups_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      paluwagan_members: {
        Row: {
          created_at: string
          family_id: string
          group_id: string
          id: string
          is_us: boolean
          name: string
          turn: number
        }
        Insert: {
          created_at?: string
          family_id: string
          group_id: string
          id?: string
          is_us?: boolean
          name: string
          turn: number
        }
        Update: {
          created_at?: string
          family_id?: string
          group_id?: string
          id?: string
          is_us?: boolean
          name?: string
          turn?: number
        }
        Relationships: [
          {
            foreignKeyName: "paluwagan_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paluwagan_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "paluwagan_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      paluwagan_payments: {
        Row: {
          created_at: string
          family_id: string
          group_id: string
          member_id: string
          paid_on: string
          recorded_by: string | null
          round: number
        }
        Insert: {
          created_at?: string
          family_id: string
          group_id: string
          member_id: string
          paid_on?: string
          recorded_by?: string | null
          round: number
        }
        Update: {
          created_at?: string
          family_id?: string
          group_id?: string
          member_id?: string
          paid_on?: string
          recorded_by?: string | null
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "paluwagan_payments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paluwagan_payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "paluwagan_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paluwagan_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "paluwagan_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paluwagan_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      utang_entries: {
        Row: {
          amount: number
          created_at: string
          direction: string
          due_on: string | null
          first_due_on: string | null
          family_id: string
          id: string
          instalment_frequency: string | null
          instalments: number | null
          is_private: boolean
          note: string | null
          person_name: string
          recorded_by: string | null
          remind: boolean
          started_on: string
        }
        Insert: {
          amount: number
          created_at?: string
          direction: string
          due_on?: string | null
          first_due_on?: string | null
          family_id: string
          id?: string
          instalment_frequency?: string | null
          instalments?: number | null
          is_private?: boolean
          note?: string | null
          person_name: string
          recorded_by?: string | null
          remind?: boolean
          started_on?: string
        }
        Update: {
          amount?: number
          created_at?: string
          direction?: string
          due_on?: string | null
          first_due_on?: string | null
          family_id?: string
          id?: string
          instalment_frequency?: string | null
          instalments?: number | null
          is_private?: boolean
          note?: string | null
          person_name?: string
          recorded_by?: string | null
          remind?: boolean
          started_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "utang_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utang_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      utang_payments: {
        Row: {
          amount: number
          created_at: string
          family_id: string
          id: string
          note: string | null
          paid_on: string
          recorded_by: string | null
          utang_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          family_id: string
          id?: string
          note?: string | null
          paid_on?: string
          recorded_by?: string | null
          utang_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          family_id?: string
          id?: string
          note?: string | null
          paid_on?: string
          recorded_by?: string | null
          utang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "utang_payments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utang_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utang_payments_utang_id_fkey"
            columns: ["utang_id"]
            isOneToOne: false
            referencedRelation: "utang_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string
          app_store_url: string | null
          created_at: string
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      chat_themes: {
        Row: {
          set_by: string | null
          theme: string
          topic: string
          updated_at: string
        }
        Insert: {
          set_by?: string | null
          theme: string
          topic: string
          updated_at?: string
        }
        Update: {
          set_by?: string | null
          theme?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_themes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_budgets: {
        Row: {
          amount: number
          family_id: string
          id: string
          member_id: string
          period_month: number
          period_year: number
          set_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          family_id: string
          id?: string
          member_id: string
          period_month: number
          period_year: number
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          family_id?: string
          id?: string
          member_id?: string
          period_month?: number
          period_year?: number
          set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      member_checkins: {
        Row: { id: string; family_id: string; asked_by: string; member_id: string; asked_at: string; answer: string | null; answered_at: string | null }
        Insert: { id?: string; family_id: string; asked_by: string; member_id: string; asked_at?: string; answer?: string | null; answered_at?: string | null }
        Update: { id?: string; family_id?: string; asked_by?: string; member_id?: string; asked_at?: string; answer?: string | null; answered_at?: string | null }
        Relationships: []
      }
      shared_pot_entries: {
        Row: {
          amount: number
          author_name: string
          created_at: string
          description: string
          family_id: string
          id: string
          kind: string
          member_id: string | null
          pot_id: string
          spent_on: string
          to_family_id: string | null
        }
        Insert: {
          amount: number
          author_name?: string
          created_at?: string
          description?: string
          family_id: string
          id?: string
          kind: string
          member_id?: string | null
          pot_id: string
          spent_on?: string
          to_family_id?: string | null
        }
        Update: {
          amount?: number
          author_name?: string
          created_at?: string
          description?: string
          family_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          pot_id?: string
          spent_on?: string
          to_family_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_pot_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_pot_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_pot_entries_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "shared_pots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_pot_entries_to_family_id_fkey"
            columns: ["to_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_pot_households: {
        Row: {
          family_id: string
          family_name: string
          joined_at: string
          pot_id: string
          share: number
        }
        Insert: {
          family_id: string
          family_name?: string
          joined_at?: string
          pot_id: string
          share?: number
        }
        Update: {
          family_id?: string
          family_name?: string
          joined_at?: string
          pot_id?: string
          share?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_pot_households_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_pot_households_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "shared_pots"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_pots: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_family: string
          id: string
          note: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_family: string
          id?: string
          note?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_family?: string
          id?: string
          note?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_pots_created_by_family_fkey"
            columns: ["created_by_family"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_pots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_alerts: {
        Row: { id: string; family_id: string; member_id: string; created_at: string; lat: number | null; lng: number | null; accuracy_m: number | null; notified: number; handled_by: string | null; handled_at: string | null; resolved_at: string | null }
        Insert: { id?: string; family_id: string; member_id: string; created_at?: string; lat?: number | null; lng?: number | null; accuracy_m?: number | null; notified?: number; handled_by?: string | null; handled_at?: string | null; resolved_at?: string | null }
        Update: { id?: string; family_id?: string; member_id?: string; created_at?: string; lat?: number | null; lng?: number | null; accuracy_m?: number | null; notified?: number; handled_by?: string | null; handled_at?: string | null; resolved_at?: string | null }
        Relationships: []
      }
      today_marks: {
        Row: { family_id: string; item_key: string; day: string; state: string; marked_by: string | null; created_at: string }
        Insert: { family_id: string; item_key: string; day: string; state: string; marked_by?: string | null; created_at?: string }
        Update: { family_id?: string; item_key?: string; day?: string; state?: string; marked_by?: string | null; created_at?: string }
        Relationships: []
      }
      ai_usage: {
        Row: { family_id: string; month: string; uses: number }
        Insert: { family_id: string; month: string; uses?: number }
        Update: { family_id?: string; month?: string; uses?: number }
        Relationships: []
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
          repeat_days: number[] | null
          repeat_until: string | null
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
          repeat_days?: number[] | null
          repeat_until?: string | null
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
          repeat_days?: number[] | null
          repeat_until?: string | null
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
      asset_items: {
        Row: {
          transaction_id: string | null
          acquired_on: string | null
          asset_id: string
          cost: number
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          kind: string
          name: string
          note: string | null
          value_now: number | null
        }
        Insert: {
          transaction_id?: string | null
          acquired_on?: string | null
          asset_id: string
          cost: number
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          kind?: string
          name: string
          note?: string | null
          value_now?: number | null
        }
        Update: {
          transaction_id?: string | null
          acquired_on?: string | null
          asset_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          kind?: string
          name?: string
          note?: string | null
          value_now?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acquired_on: string | null
          annual_change_pct: number | null
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
          valued_on: string | null
        }
        Insert: {
          acquired_on?: string | null
          annual_change_pct?: number | null
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
          valued_on?: string | null
        }
        Update: {
          acquired_on?: string | null
          annual_change_pct?: number | null
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
          valued_on?: string | null
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
          account_id: string | null
          against_id: string | null
          against_table: string | null
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          family_id: string
          id: string
          is_joint: boolean | null
          owner_member_id: string | null
          name: string
          paid_at: string | null
          paid_by_member_id: string | null
          paid_from_account_id: string | null
          recurrence: string | null
          remind_days_before: number
          status: string
          sub_note: string | null
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          against_id?: string | null
          against_table?: string | null
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          family_id: string
          id?: string
          is_joint?: boolean | null
          owner_member_id?: string | null
          name: string
          paid_at?: string | null
          paid_by_member_id?: string | null
          paid_from_account_id?: string | null
          recurrence?: string | null
          remind_days_before?: number
          status?: string
          sub_note?: string | null
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          against_id?: string | null
          against_table?: string | null
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          family_id?: string
          id?: string
          is_joint?: boolean | null
          owner_member_id?: string | null
          name?: string
          paid_at?: string | null
          paid_by_member_id?: string | null
          paid_from_account_id?: string | null
          recurrence?: string | null
          remind_days_before?: number
          status?: string
          sub_note?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
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
      spending_budgets: {
        Row: {
          amount: number
          category: string
          family_id: string
          from_month: string
          id: string
          member_id: string | null
          set_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          family_id: string
          from_month: string
          id?: string
          member_id?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          family_id?: string
          from_month?: string
          id?: string
          member_id?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_budgets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_budgets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_budgets_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_sharing: {
        Row: {
          family_id: string
          is_private: boolean
          member_id: string
          updated_at: string
        }
        Insert: {
          family_id: string
          is_private?: boolean
          member_id: string
          updated_at?: string
        }
        Update: {
          family_id?: string
          is_private?: boolean
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_sharing_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_sharing_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_viewers: {
        Row: {
          added_at: string
          family_id: string
          owner_member_id: string
          viewer_member_id: string
        }
        Insert: {
          added_at?: string
          family_id: string
          owner_member_id: string
          viewer_member_id: string
        }
        Update: {
          added_at?: string
          family_id?: string
          owner_member_id?: string
          viewer_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_viewers_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_viewers_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_viewers_viewer_member_id_fkey"
            columns: ["viewer_member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
      buy_item_meals: {
        Row: {
          buy_item_id: string
          created_at: string
          family_id: string
          meal_plan_id: string
          quantity: number | null
        }
        Insert: {
          buy_item_id: string
          created_at?: string
          family_id: string
          meal_plan_id: string
          quantity?: number | null
        }
        Update: {
          buy_item_id?: string
          created_at?: string
          family_id?: string
          meal_plan_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_item_meals_buy_item_id_fkey"
            columns: ["buy_item_id"]
            isOneToOne: false
            referencedRelation: "buy_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_item_meals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_item_meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_items: {
        Row: {
          actual_cost: number | null
          budget: number | null
          checked: boolean
          checked_at: string | null
          cleared: boolean
          cleared_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          event_id: string | null
          family_id: string
          helper_id: string | null
          helper_name: string | null
          id: string
          medicine_id: string | null
          member_id: string | null
          name: string
          planned_for: string | null
          quantity: number | null
          section: string
          source: string
          store_kind: string | null
          store_name: string | null
          unit: string | null
          unit_price_override: number | null
        }
        Insert: {
          actual_cost?: number | null
          budget?: number | null
          checked?: boolean
          checked_at?: string | null
          cleared?: boolean
          cleared_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          family_id: string
          helper_id?: string | null
          helper_name?: string | null
          id?: string
          medicine_id?: string | null
          member_id?: string | null
          name: string
          planned_for?: string | null
          quantity?: number | null
          section?: string
          source: string
          store_kind?: string | null
          store_name?: string | null
          unit?: string | null
          unit_price_override?: number | null
        }
        Update: {
          actual_cost?: number | null
          budget?: number | null
          checked?: boolean
          checked_at?: string | null
          cleared?: boolean
          cleared_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          family_id?: string
          helper_id?: string | null
          helper_name?: string | null
          id?: string
          medicine_id?: string | null
          member_id?: string | null
          name?: string
          planned_for?: string | null
          quantity?: number | null
          section?: string
          source?: string
          store_kind?: string | null
          store_name?: string | null
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
            foreignKeyName: "buy_items_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "household_helpers"
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
      buy_trips: {
        Row: {
          actual: number
          budget: number
          checked_out_at: string
          created_by: string | null
          family_id: string
          id: string
          item_count: number
          items: Json
          paid: number | null
          savings: number
        }
        Insert: {
          actual?: number
          budget?: number
          checked_out_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          item_count?: number
          items?: Json
          paid?: number | null
          savings?: number
        }
        Update: {
          actual?: number
          budget?: number
          checked_out_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          item_count?: number
          items?: Json
          paid?: number | null
          savings?: number
        }
        Relationships: [
          {
            foreignKeyName: "buy_trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_trips_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
          share_with_family: boolean
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
          share_with_family?: boolean
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
          share_with_family?: boolean
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
          share_in_emergency: boolean
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
          share_in_emergency?: boolean
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
          share_in_emergency?: boolean
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
      household_places: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          lat: number
          lng: number
          name: string
          notify: boolean
          radius_m: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          lat: number
          lng: number
          name: string
          notify?: boolean
          radius_m?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          notify?: boolean
          radius_m?: number
        }
        Relationships: []
      }
      member_locations: {
        Row: {
          accuracy_m: number | null
          created_at: string
          family_id: string
          lat: number | null
          lng: number | null
          member_id: string
          parent_ok: boolean
          paused_until: string | null
          place_id: string | null
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
          parent_ok?: boolean
          paused_until?: string | null
          place_id?: string | null
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
          parent_ok?: boolean
          paused_until?: string | null
          place_id?: string | null
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
          potluck_relatives: boolean
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
          potluck_relatives?: boolean
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
          potluck_relatives?: boolean
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
          plus_credit_days: number
          referral_code: string
          referred_by: string | null
          about: string | null
          access_expires_at: string | null
          access_source: string | null
          access_status: string
          background_url: string | null
          billing_customer_id: string | null
          billing_subscription_id: string | null
          chosen_plan: string | null
          country: string | null
          created_at: string
          currency: string
          date_format: string
          id: string
          invite_code: string
          name: string
          remember_the_departed: boolean
          christmas_on_today: boolean
          share_with_relatives: boolean
          time_zone: string
          week_start: string
        }
        Insert: {
          plus_credit_days?: number
          referral_code?: string
          referred_by?: string | null
          about?: string | null
          access_expires_at?: string | null
          access_source?: string | null
          access_status?: string
          background_url?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          chosen_plan?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: string
          invite_code: string
          name: string
          remember_the_departed?: boolean
          christmas_on_today?: boolean
          share_with_relatives?: boolean
          time_zone?: string
          week_start?: string
        }
        Update: {
          plus_credit_days?: number
          referral_code?: string
          referred_by?: string | null
          about?: string | null
          access_expires_at?: string | null
          access_source?: string | null
          access_status?: string
          background_url?: string | null
          billing_customer_id?: string | null
          billing_subscription_id?: string | null
          chosen_plan?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: string
          invite_code?: string
          name?: string
          remember_the_departed?: boolean
          christmas_on_today?: boolean
          share_with_relatives?: boolean
          time_zone?: string
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
      connections: {
        Row: { addressee_person_id: string; decided_at: string | null; ended_by: string | null; guardian_decided_by: string | null; id: string; requested_at: string; requester_person_id: string; status: string; via: string }
        Insert: { addressee_person_id: string; decided_at?: string | null; ended_by?: string | null; id?: string; requested_at?: string; requester_person_id: string; status?: string; via?: string }
        Update: { addressee_person_id?: string; decided_at?: string | null; ended_by?: string | null; id?: string; requested_at?: string; requester_person_id?: string; status?: string; via?: string }
        Relationships: []
      }
      connection_codes: {
        Row: { code: string; created_at: string; person_id: string }
        Insert: { code: string; created_at?: string; person_id: string }
        Update: { code?: string; created_at?: string; person_id?: string }
        Relationships: []
      }
      family_tree_messages: {
        Row: { mentions: string[]; pinned_at: string | null; pinned_by: string | null; deleted_at: string | null; edited_at: string | null; forwarded_from: string | null; author_name: string; body: string; created_at: string; family_id: string; id: string; member_id: string | null; person_id: string | null; reply_to: string | null }
        Insert: { mentions?: string[]; pinned_at?: string | null; pinned_by?: string | null; deleted_at?: string | null; edited_at?: string | null; forwarded_from?: string | null; author_name?: string; body: string; created_at?: string; family_id?: string; id?: string; member_id?: string | null; person_id?: string | null; reply_to?: string | null }
        Update: { mentions?: string[]; pinned_at?: string | null; pinned_by?: string | null; deleted_at?: string | null; edited_at?: string | null; forwarded_from?: string | null; author_name?: string; body?: string; created_at?: string; family_id?: string; id?: string; member_id?: string | null; person_id?: string | null; reply_to?: string | null }
        Relationships: []
      }
      direct_messages: {
        Row: { mentions: string[]; pinned_at: string | null; pinned_by: string | null; deleted_at: string | null; edited_at: string | null; forwarded_from: string | null; body: string; created_at: string; id: string; person_high: string; person_low: string; reply_to: string | null; sender_person_id: string | null }
        Insert: { mentions?: string[]; pinned_at?: string | null; pinned_by?: string | null; deleted_at?: string | null; edited_at?: string | null; forwarded_from?: string | null; body: string; created_at?: string; id?: string; person_high: string; person_low: string; reply_to?: string | null; sender_person_id?: string | null }
        Update: { mentions?: string[]; pinned_at?: string | null; pinned_by?: string | null; deleted_at?: string | null; edited_at?: string | null; forwarded_from?: string | null; body?: string; created_at?: string; id?: string; person_high?: string; person_low?: string; reply_to?: string | null; sender_person_id?: string | null }
        Relationships: []
      }
      group_polls: {
        Row: { allow_multiple: boolean; created_at: string; group_id: string; id: string; message_id: string; question: string }
        Insert: { allow_multiple?: boolean; created_at?: string; group_id: string; id?: string; message_id: string; question: string }
        Update: { allow_multiple?: boolean; created_at?: string; group_id?: string; id?: string; message_id?: string; question?: string }
        Relationships: []
      }
      group_poll_options: {
        Row: { id: string; label: string; poll_id: string; position: number }
        Insert: { id?: string; label: string; poll_id: string; position?: number }
        Update: { id?: string; label?: string; poll_id?: string; position?: number }
        Relationships: []
      }
      group_poll_votes: {
        Row: { created_at: string; option_id: string; person_id: string; poll_id: string; voter_name: string }
        Insert: { created_at?: string; option_id: string; person_id?: string; poll_id: string; voter_name?: string }
        Update: { created_at?: string; option_id?: string; person_id?: string; poll_id?: string; voter_name?: string }
        Relationships: []
      }
      scheduled_messages: {
        Row: { body: string; created_at: string; failed: string | null; id: string; person_id: string; send_at: string; sent_at: string | null; thread: string }
        Insert: { body: string; created_at?: string; failed?: string | null; id?: string; person_id?: string; send_at: string; sent_at?: string | null; thread: string }
        Update: { body?: string; created_at?: string; failed?: string | null; id?: string; person_id?: string; send_at?: string; sent_at?: string | null; thread?: string }
        Relationships: []
      }
      saved_messages: {
        Row: { body: string; created_at: string; forwarded_from: string | null; id: string; person_id: string }
        Insert: { body?: string; created_at?: string; forwarded_from?: string | null; id?: string; person_id?: string }
        Update: { body?: string; created_at?: string; forwarded_from?: string | null; id?: string; person_id?: string }
        Relationships: []
      }
      chat_reads: {
        Row: { last_read_at: string; person_id: string; thread: string }
        Insert: { last_read_at?: string; person_id: string; thread: string }
        Update: { last_read_at?: string; person_id?: string; thread?: string }
        Relationships: []
      }
      chat_room_attachments: {
        Row: { created_at: string; direct_message_id: string | null; family_id: string; family_message_id: string | null; file_name: string; group_message_id: string | null; id: string; saved_message_id: string | null; mime_type: string; position: number; size_bytes: number; storage_path: string; transcript: string | null }
        Insert: { created_at?: string; direct_message_id?: string | null; family_id: string; family_message_id?: string | null; file_name: string; group_message_id?: string | null; id?: string; saved_message_id?: string | null; mime_type: string; position?: number; size_bytes: number; storage_path: string; transcript?: string | null }
        Update: { created_at?: string; direct_message_id?: string | null; family_id?: string; family_message_id?: string | null; file_name?: string; group_message_id?: string | null; id?: string; saved_message_id?: string | null; mime_type?: string; position?: number; size_bytes?: number; storage_path?: string }
        Relationships: []
      }
      chat_room_reactions: {
        Row: { author_name: string; created_at: string; direct_message_id: string | null; emoji: string; family_id: string | null; family_message_id: string | null; group_message_id: string | null; id: string; link_message_id: string | null; person_id: string }
        Insert: { author_name?: string; created_at?: string; direct_message_id?: string | null; emoji: string; family_id?: string | null; family_message_id?: string | null; group_message_id?: string | null; id?: string; link_message_id?: string | null; person_id?: string }
        Update: { author_name?: string; created_at?: string; direct_message_id?: string | null; emoji?: string; family_id?: string | null; family_message_id?: string | null; group_message_id?: string | null; id?: string; person_id?: string }
        Relationships: []
      }
      chat_thread_prefs: {
        Row: { muted: boolean; muted_until: string | null; person_id: string; pinned: boolean; thread: string; updated_at: string }
        Insert: { muted?: boolean; muted_until?: string | null; person_id: string; pinned?: boolean; thread: string; updated_at?: string }
        Update: { muted?: boolean; muted_until?: string | null; person_id?: string; pinned?: boolean; thread?: string; updated_at?: string }
        Relationships: []
      }
      chat_groups: {
        Row: { announce_only: boolean; created_at: string; created_by: string | null; id: string; name: string }
        Insert: { announce_only?: boolean; created_at?: string; created_by?: string | null; id?: string; name: string }
        Update: { announce_only?: boolean; created_at?: string; created_by?: string | null; id?: string; name?: string }
        Relationships: []
      }
      chat_group_members: {
        Row: { added_at: string; added_by: string | null; group_id: string; person_id: string; role: string }
        Insert: { added_at?: string; added_by?: string | null; group_id: string; person_id: string; role?: string }
        Update: { added_at?: string; added_by?: string | null; group_id?: string; person_id?: string; role?: string }
        Relationships: []
      }
      chat_group_messages: {
        Row: { mentions: string[]; pinned_at: string | null; pinned_by: string | null; deleted_at: string | null; edited_at: string | null; forwarded_from: string | null; author_name: string; body: string; created_at: string; group_id: string; id: string; reply_to: string | null; sender_person_id: string | null }
        Insert: { mentions?: string[]; pinned_at?: string | null; pinned_by?: string | null; deleted_at?: string | null; edited_at?: string | null; forwarded_from?: string | null; author_name?: string; body: string; created_at?: string; group_id: string; id?: string; reply_to?: string | null; sender_person_id?: string | null }
        Update: { mentions?: string[]; pinned_at?: string | null; pinned_by?: string | null; deleted_at?: string | null; edited_at?: string | null; forwarded_from?: string | null; author_name?: string; body?: string; created_at?: string; group_id?: string; id?: string; reply_to?: string | null; sender_person_id?: string | null }
        Relationships: []
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
      chat_album_photos: {
        Row: { added_at: string; added_by: string | null; album_id: string; attachment_id: string; family_id: string }
        Insert: { added_at?: string; added_by?: string | null; album_id: string; attachment_id: string; family_id: string }
        Update: { added_at?: string; added_by?: string | null; album_id?: string; attachment_id?: string; family_id?: string }
        Relationships: []
      }
      chat_albums: {
        Row: { created_at: string; created_by: string | null; family_id: string; id: string; name: string }
        Insert: { created_at?: string; created_by?: string | null; family_id: string; id?: string; name: string }
        Update: { created_at?: string; created_by?: string | null; family_id?: string; id?: string; name?: string }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          assets: number
          cash: number
          family_id: string
          goals: number
          liabilities: number
          month: string
          net_worth: number
          scope: string
          updated_at: string
          viewer_member_id: string
        }
        Insert: {
          assets?: number
          cash?: number
          family_id: string
          goals?: number
          liabilities?: number
          month: string
          net_worth: number
          scope: string
          updated_at?: string
          viewer_member_id: string
        }
        Update: {
          assets?: number
          cash?: number
          family_id?: string
          goals?: number
          liabilities?: number
          month?: string
          net_worth?: number
          scope?: string
          updated_at?: string
          viewer_member_id?: string
        }
        Relationships: []
      }
      occasion_greetings: {
        Row: {
          author_name: string
          body: string
          created_at: string
          event_family_id: string
          event_id: string
          family_id: string
          household_name: string
          id: string
          member_id: string | null
          occasion_date: string
        }
        Insert: {
          author_name?: string
          body: string
          created_at?: string
          event_family_id?: string
          event_id: string
          family_id?: string
          household_name?: string
          id?: string
          member_id?: string | null
          occasion_date?: string
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          event_family_id?: string
          event_id?: string
          family_id?: string
          household_name?: string
          id?: string
          member_id?: string | null
          occasion_date?: string
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
          transcript: string | null
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
          transcript?: string | null
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
          transcript?: string | null
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
          forwarded_from: string | null
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
          forwarded_from?: string | null
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
          forwarded_from?: string | null
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
          source_url: string | null
          steps: string[]
          tree_person_id: string | null
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
          source_url?: string | null
          steps?: string[]
          tree_person_id?: string | null
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
          source_url?: string | null
          steps?: string[]
          tree_person_id?: string | null
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
      family_tree_offer_blocks: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          blocked_family_id: string
          family_id: string
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          blocked_family_id: string
          family_id: string
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          blocked_family_id?: string
          family_id?: string
        }
        Relationships: []
      }
      family_tree_match_dismissals: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          family_id: string
          other_person_id: string
          person_id: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          family_id: string
          other_person_id: string
          person_id: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          family_id?: string
          other_person_id?: string
          person_id?: string
        }
        Relationships: []
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
          died_on: string | null
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
          died_on?: string | null
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
          died_on?: string | null
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
      family_vault_items: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          group_name: string
          id: string
          label: string
          note: string | null
          secret: string
          updated_at: string
          username: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          group_name: string
          id?: string
          label: string
          note?: string | null
          secret: string
          updated_at?: string
          username?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          group_name?: string
          id?: string
          label?: string
          note?: string | null
          secret?: string
          updated_at?: string
          username?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_vault_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_vault_items_family_id_fkey"
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
          owner_person_id: string | null
          repeats_yearly: boolean
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
          owner_person_id?: string | null
          repeats_yearly?: boolean
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
          owner_person_id?: string | null
          repeats_yearly?: boolean
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
          {
            foreignKeyName: "goals_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      health_appointments: {
        Row: {
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
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
      sent_screenshots: {
        Row: {
          created_at: string
          data: string
          family_id: string
          id: string
          member_id: string
          mime: string
        }
        Insert: {
          created_at?: string
          data: string
          family_id: string
          id?: string
          member_id: string
          mime: string
        }
        Update: {
          created_at?: string
          data?: string
          family_id?: string
          id?: string
          member_id?: string
          mime?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_screenshots_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_screenshots_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      health_medicines: {
        Row: {
          created_at: string
          created_by: string | null
          dose: string | null
          end_date: string | null
          family_id: string
          id: string
          member_id: string
          name: string
          notes: string | null
          start_date: string
          times: string[]
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dose?: string | null
          end_date?: string | null
          family_id: string
          id?: string
          member_id: string
          name: string
          notes?: string | null
          start_date?: string
          times?: string[]
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dose?: string | null
          end_date?: string | null
          family_id?: string
          id?: string
          member_id?: string
          name?: string
          notes?: string | null
          start_date?: string
          times?: string[]
          visibility?: string
        }
        Relationships: []
      }
      health_medicine_alerts: {
        Row: {
          active_since: string
          delay_minutes: number
          family_id: string
          medicine_id: string
          notify_member_id: string
          set_by: string | null
          updated_at: string
        }
        Insert: {
          active_since?: string
          delay_minutes?: number
          family_id: string
          medicine_id: string
          notify_member_id: string
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          active_since?: string
          delay_minutes?: number
          family_id?: string
          medicine_id?: string
          notify_member_id?: string
          set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      health_medicine_doses: {
        Row: {
          dose_date: string
          dose_time: string
          family_id: string
          id: string
          medicine_id: string
          taken_at: string
          taken_by: string | null
        }
        Insert: {
          dose_date: string
          dose_time: string
          family_id: string
          id?: string
          medicine_id: string
          taken_at?: string
          taken_by?: string | null
        }
        Update: {
          dose_date?: string
          dose_time?: string
          family_id?: string
          id?: string
          medicine_id?: string
          taken_at?: string
          taken_by?: string | null
        }
        Relationships: []
      }
      health_medicine_supply: {
        Row: {
          counted: number
          counted_at: string
          family_id: string
          list_item_id: string | null
          medicine_id: string
          per_dose: number
          set_by: string | null
          show_name_to_helper: boolean
          store: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          counted: number
          counted_at?: string
          family_id: string
          list_item_id?: string | null
          medicine_id: string
          per_dose?: number
          set_by?: string | null
          show_name_to_helper?: boolean
          store?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          counted?: number
          counted_at?: string
          family_id?: string
          list_item_id?: string | null
          medicine_id?: string
          per_dose?: number
          set_by?: string | null
          show_name_to_helper?: boolean
          store?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      health_illness_logs: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          given: string | null
          id: string
          logged_at: string
          member_id: string
          note: string | null
          symptoms: string | null
          temperature_c: number | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          given?: string | null
          id?: string
          logged_at?: string
          member_id: string
          note?: string | null
          symptoms?: string | null
          temperature_c?: number | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          given?: string | null
          id?: string
          logged_at?: string
          member_id?: string
          note?: string | null
          symptoms?: string | null
          temperature_c?: number | null
          visibility?: string
        }
        Relationships: []
      }
      health_medicine_photos: {
        Row: {
          medicine_id: string
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          storage_path: string
        }
        Insert: {
          medicine_id: string
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          storage_path: string
        }
        Update: {
          medicine_id?: string
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: []
      }
      health_visit_photos: {
        Row: {
          appointment_id: string
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          storage_path: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          storage_path: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: []
      }
      event_photos: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          family_id: string
          id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          family_id: string
          id?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          family_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: []
      }
      event_comments: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          event_id: string
          family_id: string
          id: string
          member_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          event_id: string
          family_id: string
          id?: string
          member_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          event_id?: string
          family_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests: {
        Row: {
          answer: string | null
          created_at: string
          event_id: string
          family_id: string
          headcount: number
          id: string
          name: string
          name_key: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          event_id: string
          family_id: string
          headcount?: number
          id?: string
          name: string
          name_key: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          event_id?: string
          family_id?: string
          headcount?: number
          id?: string
          name?: string
          name_key?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      potluck_items: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          family_id: string
          id: string
          label: string
          position: number
          wanted: number
          guest_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          family_id: string
          id?: string
          label: string
          position?: number
          wanted?: number
          guest_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          family_id?: string
          id?: string
          label?: string
          position?: number
          wanted?: number
          guest_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "potluck_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potluck_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potluck_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      potluck_claims: {
        Row: {
          created_at: string
          event_family_id: string
          event_id: string
          family_id: string
          household_name: string
          id: string
          item_id: string
          member_id: string | null
          member_name: string
          qty: number
          guest_id: string | null
        }
        Insert: {
          created_at?: string
          event_family_id: string
          event_id: string
          family_id: string
          household_name?: string
          id?: string
          item_id: string
          member_id: string | null
          member_name?: string
          qty?: number
          guest_id?: string | null
        }
        Update: {
          created_at?: string
          event_family_id?: string
          event_id?: string
          family_id?: string
          household_name?: string
          id?: string
          item_id?: string
          member_id?: string | null
          member_name?: string
          qty?: number
          guest_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "potluck_claims_event_family_id_fkey"
            columns: ["event_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potluck_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potluck_claims_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potluck_claims_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "potluck_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potluck_claims_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      game_awards: {
        Row: {
          created_at: string
          day: string
          family_id: string
          id: string
          kind: string
          member_id: string
          points: number
          xp: number
        }
        Insert: {
          created_at?: string
          day: string
          family_id: string
          id?: string
          kind: string
          member_id: string
          points?: number
          xp?: number
        }
        Update: {
          created_at?: string
          day?: string
          family_id?: string
          id?: string
          kind?: string
          member_id?: string
          points?: number
          xp?: number
        }
        Relationships: []
      }
      game_badges: {
        Row: {
          category: string | null
          description: string
          icon: string
          id: string
          rule: string
          sort: number
          threshold: number
          title: string
        }
        Insert: {
          category?: string | null
          description: string
          icon: string
          id: string
          rule: string
          sort?: number
          threshold: number
          title: string
        }
        Update: {
          category?: string | null
          description?: string
          icon?: string
          id?: string
          rule?: string
          sort?: number
          threshold?: number
          title?: string
        }
        Relationships: []
      }
      game_days: {
        Row: {
          closed_at: string
          day: string
          everyone_done: boolean
          family_id: string
          players: number
        }
        Insert: {
          closed_at?: string
          day: string
          everyone_done?: boolean
          family_id: string
          players?: number
        }
        Update: {
          closed_at?: string
          day?: string
          everyone_done?: boolean
          family_id?: string
          players?: number
        }
        Relationships: []
      }
      game_family_streaks: {
        Row: {
          best_streak: number
          family_id: string
          last_day: string | null
          streak: number
          updated_at: string
        }
        Insert: {
          best_streak?: number
          family_id: string
          last_day?: string | null
          streak?: number
          updated_at?: string
        }
        Update: {
          best_streak?: number
          family_id?: string
          last_day?: string | null
          streak?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_family_weeks: {
        Row: {
          all_done: boolean
          closed_at: string
          family_id: string
          goals: number
          treat_used_at: string | null
          treat_used_by: string | null
          week_start: string
        }
        Insert: {
          all_done?: boolean
          closed_at?: string
          family_id: string
          goals?: number
          treat_used_at?: string | null
          treat_used_by?: string | null
          week_start: string
        }
        Update: {
          all_done?: boolean
          closed_at?: string
          family_id?: string
          goals?: number
          treat_used_at?: string | null
          treat_used_by?: string | null
          week_start?: string
        }
        Relationships: []
      }
      game_member_badges: {
        Row: {
          badge_id: string
          created_at: string
          earned_on: string
          family_id: string
          member_id: string
        }
        Insert: {
          badge_id: string
          created_at?: string
          earned_on: string
          family_id: string
          member_id: string
        }
        Update: {
          badge_id?: string
          created_at?: string
          earned_on?: string
          family_id?: string
          member_id?: string
        }
        Relationships: []
      }
      game_streaks: {
        Row: {
          best_streak: number
          family_id: string
          freeze_used_on: string | null
          freezes: number
          last_day: string | null
          member_id: string
          streak: number
          updated_at: string
        }
        Insert: {
          best_streak?: number
          family_id: string
          freeze_used_on?: string | null
          freezes?: number
          last_day?: string | null
          member_id: string
          streak?: number
          updated_at?: string
        }
        Update: {
          best_streak?: number
          family_id?: string
          freeze_used_on?: string | null
          freezes?: number
          last_day?: string | null
          member_id?: string
          streak?: number
          updated_at?: string
        }
        Relationships: []
      }
      gift_draws: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          drawn_at: string | null
          exchange_date: string
          family_id: string
          id: string
          not_own_household: boolean
          price_cap: number | null
          reveal_on_day: boolean
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          drawn_at?: string | null
          exchange_date: string
          family_id: string
          id?: string
          not_own_household?: boolean
          price_cap?: number | null
          reveal_on_day?: boolean
          title?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          drawn_at?: string | null
          exchange_date?: string
          family_id?: string
          id?: string
          not_own_household?: boolean
          price_cap?: number | null
          reveal_on_day?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_draws_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draws_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_draw_households: {
        Row: {
          draw_id: string
          family_id: string
          household_name: string
        }
        Insert: {
          draw_id: string
          family_id: string
          household_name?: string
        }
        Update: {
          draw_id?: string
          family_id?: string
          household_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_draw_households_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "gift_draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_households_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_draw_people: {
        Row: {
          added_by: string | null
          created_at: string
          draw_id: string
          family_id: string
          household_name: string
          id: string
          member_id: string | null
          name: string
          guest_id: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          draw_id: string
          family_id: string
          household_name?: string
          id?: string
          member_id: string | null
          name?: string
          guest_id?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          draw_id?: string
          family_id?: string
          household_name?: string
          id?: string
          member_id?: string | null
          name?: string
          guest_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_draw_people_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_people_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "gift_draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_people_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_people_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_draw_picks: {
        Row: {
          draw_id: string
          giver_id: string
          receiver_id: string
        }
        Insert: {
          draw_id: string
          giver_id: string
          receiver_id: string
        }
        Update: {
          draw_id?: string
          giver_id?: string
          receiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_draw_picks_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "gift_draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_picks_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "gift_draw_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_picks_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "gift_draw_people"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_draw_wishes: {
        Row: {
          body: string
          created_at: string
          draw_id: string
          id: string
          person_id: string
        }
        Insert: {
          body: string
          created_at?: string
          draw_id: string
          id?: string
          person_id: string
        }
        Update: {
          body?: string
          created_at?: string
          draw_id?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_draw_wishes_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "gift_draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_draw_wishes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "gift_draw_people"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_list_people: {
        Row: {
          budget: number | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          kind: string
          member_id: string | null
          name: string
          year: number
        }
        Insert: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          kind?: string
          member_id?: string | null
          name: string
          year: number
        }
        Update: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          name?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_list_people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_list_people_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_list_people_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_list_items: {
        Row: {
          bought: boolean
          bought_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          is_cash: boolean
          label: string
          person_id: string
        }
        Insert: {
          bought?: boolean
          bought_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          is_cash?: boolean
          label: string
          person_id: string
        }
        Update: {
          bought?: boolean
          bought_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          is_cash?: boolean
          label?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_list_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_list_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_list_items_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "gift_list_people"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          answer: string
          answered_by: string | null
          event_id: string
          family_id: string
          member_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          answered_by?: string | null
          event_id: string
          family_id: string
          member_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          answered_by?: string | null
          event_id?: string
          family_id?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: []
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
      health_visit_questions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          done: boolean
          family_id: string
          id: string
          member_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          done?: boolean
          family_id: string
          id?: string
          member_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          done?: boolean
          family_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_visit_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_visit_questions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_visit_questions_member_id_fkey"
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
      income_groups: {
        Row: {
          account_id: string | null
          category: string | null
          created_at: string
          family_id: string
          frequency: string
          id: string
          monthly_target: number | null
          name: string
          recorded_by: string | null
          usual_amount: number
        }
        Insert: {
          account_id?: string | null
          category?: string | null
          created_at?: string
          family_id: string
          frequency?: string
          id?: string
          monthly_target?: number | null
          name: string
          recorded_by?: string | null
          usual_amount: number
        }
        Update: {
          account_id?: string | null
          category?: string | null
          created_at?: string
          family_id?: string
          frequency?: string
          id?: string
          monthly_target?: number | null
          name?: string
          recorded_by?: string | null
          usual_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "income_groups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_groups_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_groups_recorded_by_fkey"
            columns: ["recorded_by"]
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
          group_id: string | null
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
          group_id?: string | null
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
          group_id?: string | null
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
            foreignKeyName: "income_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "income_groups"
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
          author_name: string
          body: string
          created_at: string
          entry_id: string
          family_id: string
          id: string
          member_id: string | null
        }
        Insert: {
          author_name?: string
          body: string
          created_at?: string
          entry_id: string
          family_id: string
          id?: string
          member_id?: string | null
        }
        Update: {
          author_name?: string
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
      journal_reactions: {
        Row: {
          author_name: string
          created_at: string
          emoji: string
          entry_id: string
          family_id: string
          id: string
          member_id: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          emoji: string
          entry_id: string
          family_id: string
          id?: string
          member_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          emoji?: string
          entry_id?: string
          family_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_reactions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_reactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_reactions_member_id_fkey"
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
          event_id: string | null
          family_id: string
          id: string
          milestone: boolean
          milestone_member_id: string | null
          note: string | null
          owner_person_id: string | null
          public_at: string | null
          shared_at: string | null
          source: string
          source_activity_id: string | null
          title: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date: string
          event_id?: string | null
          family_id: string
          id?: string
          milestone?: boolean
          milestone_member_id?: string | null
          note?: string | null
          owner_person_id?: string | null
          public_at?: string | null
          shared_at?: string | null
          source?: string
          source_activity_id?: string | null
          title: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          event_id?: string | null
          family_id?: string
          id?: string
          milestone?: boolean
          milestone_member_id?: string | null
          note?: string | null
          owner_person_id?: string | null
          public_at?: string | null
          shared_at?: string | null
          source?: string
          source_activity_id?: string | null
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_milestone_member_id_fkey"
            columns: ["milestone_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "journal_entries_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
      journal_entry_videos: {
        Row: {
          created_at: string
          created_by: string | null
          duration_seconds: number
          entry_id: string
          family_id: string
          height: number
          look: string
          mime_type: string
          poster_path: string
          storage_path: string
          width: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_seconds: number
          entry_id: string
          family_id: string
          height: number
          look?: string
          mime_type: string
          poster_path: string
          storage_path: string
          width: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_seconds?: number
          entry_id?: string
          family_id?: string
          height?: number
          look?: string
          mime_type?: string
          poster_path?: string
          storage_path?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_videos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_videos_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
          owner_person_id: string | null
          storage_path: string | null
          storage_provider: string
          taken_at: string | null
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          drive_thumbnail_link?: string | null
          drive_view_link?: string | null
          family_id: string
          id?: string
          media_type?: string
          owner_person_id?: string | null
          storage_path?: string | null
          storage_provider?: string
          taken_at?: string | null
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          drive_thumbnail_link?: string | null
          drive_view_link?: string | null
          family_id?: string
          id?: string
          media_type?: string
          owner_person_id?: string | null
          storage_path?: string | null
          storage_provider?: string
          taken_at?: string | null
          uploaded_by?: string | null
          visibility?: string
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
            foreignKeyName: "journal_media_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
          asset_id: string | null
          balance: number
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          interest_rate: number | null
          is_joint: boolean
          kind: string
          lender: string | null
          linked_account_id: string | null
          monthly_payment: number | null
          name: string
          next_payment_date: string | null
          note: string | null
          owner_member_id: string | null
          payments_remaining: number | null
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          balance?: number
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          interest_rate?: number | null
          is_joint?: boolean
          kind?: string
          lender?: string | null
          linked_account_id?: string | null
          monthly_payment?: number | null
          name: string
          next_payment_date?: string | null
          note?: string | null
          owner_member_id?: string | null
          payments_remaining?: number | null
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          balance?: number
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          interest_rate?: number | null
          is_joint?: boolean
          kind?: string
          lender?: string | null
          linked_account_id?: string | null
          monthly_payment?: number | null
          name?: string
          next_payment_date?: string | null
          note?: string | null
          owner_member_id?: string | null
          payments_remaining?: number | null
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
      household_offers: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          code: string
          completed_at: string | null
          days: number
          expires_at: string
          family_id: string
          id: string
          offered_at: string
          status: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          code: string
          completed_at?: string | null
          days: number
          expires_at?: string
          family_id: string
          id?: string
          offered_at?: string
          status?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          code?: string
          completed_at?: string | null
          days?: number
          expires_at?: string
          family_id?: string
          id?: string
          offered_at?: string
          status?: string
        }
        Relationships: []
      }
      kin_plus_awards: {
        Row: {
          created_at: string
          days: number
          family_id: string
          id: string
          reason: string
          source_family: string | null
        }
        Insert: {
          created_at?: string
          days: number
          family_id: string
          id?: string
          reason: string
          source_family?: string | null
        }
        Update: {
          created_at?: string
          days?: number
          family_id?: string
          id?: string
          reason?: string
          source_family?: string | null
        }
        Relationships: []
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
      loyalty_cards: {
        Row: {
          card_name: string
          card_number: string
          code_format: string
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          note: string | null
          store: string
          updated_at: string
        }
        Insert: {
          card_name?: string
          card_number: string
          code_format?: string
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          note?: string | null
          store: string
          updated_at?: string
        }
        Update: {
          card_name?: string
          card_number?: string
          code_format?: string
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          note?: string | null
          store?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_cards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          cover_avatar_id: string | null
          moved_at: string | null
          person_id: string
          sex: string | null
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          brief_hash: string | null
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
          kid_view: boolean
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
          calendar_feed_hash: string | null
          palette: string
          quick_actions: Json
          look_offer_answered_at: string | null
          start_here_dismissed_at: string | null
          text_scale: number
          simple_mode: boolean
          text_size: string
          theme: string
          tin_number: string | null
          timezone: string | null
          tshirt_size: string | null
          wealth_include_private: boolean
          weight: string | null
          work_contact_info: string | null
          work_email: string | null
        }
        Insert: {
          cover_avatar_id?: string | null
          moved_at?: string | null
          person_id?: string
          sex?: string | null
          allergies?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          blood_type?: string | null
          brief_hash?: string | null
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
          kid_view?: boolean
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
          calendar_feed_hash?: string | null
          palette?: string
          quick_actions?: Json
          look_offer_answered_at?: string | null
          start_here_dismissed_at?: string | null
          text_scale?: number
          simple_mode?: boolean
          text_size?: string
          theme?: string
          tin_number?: string | null
          timezone?: string | null
          tshirt_size?: string | null
          wealth_include_private?: boolean
          weight?: string | null
          work_contact_info?: string | null
          work_email?: string | null
        }
        Update: {
          cover_avatar_id?: string | null
          moved_at?: string | null
          person_id?: string
          sex?: string | null
          allergies?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          blood_type?: string | null
          brief_hash?: string | null
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
          kid_view?: boolean
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
          calendar_feed_hash?: string | null
          palette?: string
          quick_actions?: Json
          look_offer_answered_at?: string | null
          start_here_dismissed_at?: string | null
          text_scale?: number
          simple_mode?: boolean
          text_size?: string
          theme?: string
          tin_number?: string | null
          timezone?: string | null
          tshirt_size?: string | null
          wealth_include_private?: boolean
          weight?: string | null
          work_contact_info?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_cover_avatar_id_fkey"
            columns: ["cover_avatar_id"]
            isOneToOne: false
            referencedRelation: "member_avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string | null
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
          event_id?: string | null
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
          event_id?: string | null
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
          low_since: string | null
          running_low: boolean
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
          low_since?: string | null
          running_low?: boolean
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
          low_since?: string | null
          running_low?: boolean
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
      people: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      personal_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          owner_person_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          owner_person_id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          owner_person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_notes_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_comments: {
        Row: {
          body: string
          created_at: string
          family_background_id: string | null
          family_id: string
          id: string
          journal_media_id: string | null
          member_avatar_id: string | null
          member_id: string
        }
        Insert: {
          body: string
          created_at?: string
          family_background_id?: string | null
          family_id: string
          id?: string
          journal_media_id?: string | null
          member_avatar_id?: string | null
          member_id: string
        }
        Update: {
          body?: string
          created_at?: string
          family_background_id?: string | null
          family_id?: string
          id?: string
          journal_media_id?: string | null
          member_avatar_id?: string | null
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_comments_family_background_id_fkey"
            columns: ["family_background_id"]
            isOneToOne: false
            referencedRelation: "family_backgrounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_journal_media_id_fkey"
            columns: ["journal_media_id"]
            isOneToOne: false
            referencedRelation: "journal_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_member_avatar_id_fkey"
            columns: ["member_avatar_id"]
            isOneToOne: false
            referencedRelation: "member_avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_reactions: {
        Row: {
          created_at: string
          emoji: string
          family_background_id: string | null
          family_id: string
          id: string
          journal_media_id: string | null
          member_avatar_id: string | null
          member_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          family_background_id?: string | null
          family_id: string
          id?: string
          journal_media_id?: string | null
          member_avatar_id?: string | null
          member_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          family_background_id?: string | null
          family_id?: string
          id?: string
          journal_media_id?: string | null
          member_avatar_id?: string | null
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_reactions_family_background_id_fkey"
            columns: ["family_background_id"]
            isOneToOne: false
            referencedRelation: "family_backgrounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reactions_journal_media_id_fkey"
            columns: ["journal_media_id"]
            isOneToOne: false
            referencedRelation: "journal_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reactions_member_avatar_id_fkey"
            columns: ["member_avatar_id"]
            isOneToOne: false
            referencedRelation: "member_avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_goal_changes: {
        Row: {
          change_due_date: boolean
          created_at: string
          decided_at: string | null
          decided_by: string | null
          due_date: string | null
          family_id: string
          goal_id: string
          id: string
          period: string | null
          proposed_by: string | null
          status: string
          target: number | null
          title: string | null
          unit: string | null
        }
        Insert: {
          change_due_date?: boolean
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          due_date?: string | null
          family_id: string
          goal_id: string
          id?: string
          period?: string | null
          proposed_by?: string | null
          status?: string
          target?: number | null
          title?: string | null
          unit?: string | null
        }
        Update: {
          change_due_date?: boolean
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          due_date?: string | null
          family_id?: string
          goal_id?: string
          id?: string
          period?: string | null
          proposed_by?: string | null
          status?: string
          target?: number | null
          title?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      planner_goal_completions: {
        Row: {
          credited_to: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          family_id: string
          goal_id: string
          id: string
          member_id: string
          part: string
          period_start: string
          points: number
          status: string
          xp: number
        }
        Insert: {
          credited_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id: string
          goal_id: string
          id?: string
          member_id: string
          part?: string
          period_start: string
          points?: number
          status?: string
          xp?: number
        }
        Update: {
          credited_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id?: string
          goal_id?: string
          id?: string
          member_id?: string
          part?: string
          period_start?: string
          points?: number
          status?: string
          xp?: number
        }
        Relationships: []
      }
      planner_goal_entries: {
        Row: {
          amount: number
          created_at: string
          entry_date: string
          family_id: string
          goal_id: string
          id: string
          member_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          entry_date: string
          family_id: string
          goal_id: string
          id?: string
          member_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          entry_date?: string
          family_id?: string
          goal_id?: string
          id?: string
          member_id?: string | null
        }
        Relationships: []
      }
      planner_goal_links: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          goal_id: string
          linked_goal_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          goal_id: string
          linked_goal_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          goal_id?: string
          linked_goal_id?: string
        }
        Relationships: []
      }
      planner_goal_rewards: {
        Row: {
          claimed_at: string | null
          confirmed_at: string | null
          due_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          family_id: string
          given_at: string | null
          giver_member_id: string | null
          goal_id: string
          proposed_by: string | null
          status: string
          title: string
        }
        Insert: {
          claimed_at?: string | null
          confirmed_at?: string | null
          due_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id: string
          given_at?: string | null
          giver_member_id?: string | null
          goal_id: string
          proposed_by?: string | null
          status?: string
          title: string
        }
        Update: {
          claimed_at?: string | null
          confirmed_at?: string | null
          due_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id?: string
          given_at?: string | null
          giver_member_id?: string | null
          goal_id?: string
          proposed_by?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      planner_goals: {
        Row: {
          backup: boolean
          credit_to: string
          days: number[] | null
          emoji: string | null
          helps_goal_id: string | null
          removed_at: string | null
          active: boolean
          category: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          family_id: string
          id: string
          kind: string
          owner_member_id: string | null
          period: string
          points: number
          savings_goal_id: string | null
          start_value: number | null
          target: number
          title: string
          unit: string | null
          visibility: string
          xp: number
        }
        Insert: {
          backup?: boolean
          credit_to?: string
          days?: number[] | null
          emoji?: string | null
          helps_goal_id?: string | null
          removed_at?: string | null
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          family_id: string
          id?: string
          kind: string
          owner_member_id?: string | null
          period?: string
          points?: number
          savings_goal_id?: string | null
          start_value?: number | null
          target: number
          title: string
          unit?: string | null
          visibility?: string
          xp?: number
        }
        Update: {
          backup?: boolean
          credit_to?: string
          days?: number[] | null
          emoji?: string | null
          helps_goal_id?: string | null
          removed_at?: string | null
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          family_id?: string
          id?: string
          kind?: string
          owner_member_id?: string | null
          period?: string
          points?: number
          savings_goal_id?: string | null
          start_value?: number | null
          target?: number
          title?: string
          unit?: string | null
          visibility?: string
          xp?: number
        }
        Relationships: []
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
      push_subscriptions: {
        Row: { auth: string; created_at: string; endpoint: string; family_id: string; id: string; member_id: string; p256dh: string }
        Insert: { auth: string; created_at?: string; endpoint: string; family_id: string; id?: string; member_id: string; p256dh: string }
        Update: { auth?: string; created_at?: string; endpoint?: string; family_id?: string; id?: string; member_id?: string; p256dh?: string }
        Relationships: []
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
      remittance_allocations: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          family_id: string
          id: string
          purpose: string
          remittance_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          family_id: string
          id?: string
          purpose: string
          remittance_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          family_id?: string
          id?: string
          purpose?: string
          remittance_id?: string
        }
        Relationships: []
      }
      remittances: {
        Row: {
          account_id: string | null
          amount: number
          channel: string
          channel_name: string | null
          created_at: string
          currency: string
          ecb_rate: number | null
          ecb_rate_date: string | null
          family_id: string
          id: string
          is_private: boolean
          note: string | null
          php_received: number
          rate_source: string | null
          receiver_member_id: string | null
          recorded_by: string | null
          sender_member_id: string | null
          sender_name: string | null
          sent_on: string
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          channel: string
          channel_name?: string | null
          created_at?: string
          currency: string
          ecb_rate?: number | null
          ecb_rate_date?: string | null
          family_id: string
          id?: string
          is_private?: boolean
          note?: string | null
          php_received: number
          rate_source?: string | null
          receiver_member_id?: string | null
          recorded_by?: string | null
          sender_member_id?: string | null
          sender_name?: string | null
          sent_on: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          channel?: string
          channel_name?: string | null
          created_at?: string
          currency?: string
          ecb_rate?: number | null
          ecb_rate_date?: string | null
          family_id?: string
          id?: string
          is_private?: boolean
          note?: string | null
          php_received?: number
          rate_source?: string | null
          receiver_member_id?: string | null
          recorded_by?: string | null
          sender_member_id?: string | null
          sender_name?: string | null
          sent_on?: string
          transaction_id?: string | null
        }
        Relationships: []
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
          budget_amount: number | null
          unlock: string | null
          active: boolean
          cost_points: number
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          title: string
        }
        Insert: {
          budget_amount?: number | null
          unlock?: string | null
          active?: boolean
          cost_points: number
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          title: string
        }
        Update: {
          budget_amount?: number | null
          unlock?: string | null
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
      streak_bonus_rates: {
        Row: {
          created_at: string
          effective_from: string
          family_id: string
          id: string
          set_by: string | null
          seven: number
          thirty: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          family_id: string
          id?: string
          set_by?: string | null
          seven: number
          thirty: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          family_id?: string
          id?: string
          set_by?: string | null
          seven?: number
          thirty?: number
        }
        Relationships: [
          {
            foreignKeyName: "streak_bonus_rates_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streak_bonus_rates_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "members"
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
      // Emergency access to the vault (20261015120000). Read-only from the
      // app: every write goes through the functions further down.
      vault_emergency_contacts: {
        Row: {
          added_by: string | null
          added_by_name: string
          created_at: string
          family_id: string
          family_name: string
          id: string
          member_family_id: string
          member_household_name: string
          member_id: string
          member_name: string
          wait_days: number
        }
        Insert: {
          added_by?: string | null
          added_by_name?: string
          created_at?: string
          family_id: string
          family_name: string
          id?: string
          member_family_id: string
          member_household_name: string
          member_id: string
          member_name: string
          wait_days?: number
        }
        Update: {
          added_by?: string | null
          added_by_name?: string
          created_at?: string
          family_id?: string
          family_name?: string
          id?: string
          member_family_id?: string
          member_household_name?: string
          member_id?: string
          member_name?: string
          wait_days?: number
        }
        Relationships: []
      }
      vault_emergency_requests: {
        Row: {
          allowed_at: string | null
          allowed_by_name: string | null
          contact_id: string | null
          denied_at: string | null
          denied_by_name: string | null
          family_id: string
          family_name: string
          id: string
          member_household_name: string
          member_id: string | null
          member_name: string
          reason: string
          requested_at: string
          revoked_at: string | null
          revoked_by_name: string | null
          wait_days: number
        }
        Insert: {
          allowed_at?: string | null
          allowed_by_name?: string | null
          contact_id?: string | null
          denied_at?: string | null
          denied_by_name?: string | null
          family_id: string
          family_name: string
          id?: string
          member_household_name: string
          member_id?: string | null
          member_name: string
          reason: string
          requested_at?: string
          revoked_at?: string | null
          revoked_by_name?: string | null
          wait_days: number
        }
        Update: {
          allowed_at?: string | null
          allowed_by_name?: string | null
          contact_id?: string | null
          denied_at?: string | null
          denied_by_name?: string | null
          family_id?: string
          family_name?: string
          id?: string
          member_household_name?: string
          member_id?: string | null
          member_name?: string
          reason?: string
          requested_at?: string
          revoked_at?: string | null
          revoked_by_name?: string | null
          wait_days?: number
        }
        Relationships: []
      }
      push_tests: {
        Row: {
          id: number
          kind: string
          member_id: string
          sent_at: string
        }
        Insert: {
          id?: never
          kind: string
          member_id: string
          sent_at?: string
        }
        Update: {
          id?: never
          kind?: string
          member_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      vault_emergency_notices: {
        Row: {
          body: string
          created_at: string
          dismissed_at: string | null
          dismissed_by_name: string | null
          family_id: string
          id: string
        }
        Insert: {
          body: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_by_name?: string | null
          family_id: string
          id?: string
        }
        Update: {
          body?: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_by_name?: string | null
          family_id?: string
          id?: string
        }
        Relationships: []
      }
      vault_emergency_opens: {
        Row: {
          family_id: string
          id: string
          item_id: string
          item_kind: string
          item_label: string
          member_name: string
          opened_at: string
          request_id: string | null
        }
        Insert: {
          family_id: string
          id?: string
          item_id: string
          item_kind: string
          item_label: string
          member_name: string
          opened_at?: string
          request_id?: string | null
        }
        Update: {
          family_id?: string
          id?: string
          item_id?: string
          item_kind?: string
          item_label?: string
          member_name?: string
          opened_at?: string
          request_id?: string | null
        }
        Relationships: []
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
          capital: boolean
          account_id: string
          amount: number
          category: string | null
          created_at: string
          direction: string
          family_id: string
          goal_id: string | null
          id: string
          is_joint: boolean | null
          owner_member_id: string | null
          occurred_at: string
          particulars: string
          principal_amount: number | null
          recorded_by: string | null
          source_id: string | null
          source_table: string | null
          status: string
          transfer_group_id: string | null
        }
        Insert: {
          capital?: boolean
          account_id: string
          amount: number
          category?: string | null
          created_at?: string
          direction: string
          family_id: string
          goal_id?: string | null
          id?: string
          is_joint?: boolean | null
          owner_member_id?: string | null
          occurred_at?: string
          particulars: string
          principal_amount?: number | null
          recorded_by?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          transfer_group_id?: string | null
        }
        Update: {
          capital?: boolean
          account_id?: string
          amount?: number
          category?: string | null
          created_at?: string
          direction?: string
          family_id?: string
          goal_id?: string | null
          id?: string
          is_joint?: boolean | null
          owner_member_id?: string | null
          occurred_at?: string
          particulars?: string
          principal_amount?: number | null
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
      adjust_liability_balance: {
        Args: { p_delta: number; p_liability_id: string }
        Returns: number
      }
      import_wealth_transactions: {
        Args: { p_account: string; p_rows: Json }
        Returns: { imported: number; skipped: number }[]
      }
      alkansya_pay_allowances: { Args: never; Returns: number }
      alkansya_points_used: {
        Args: never
        Returns: { member_id: string; points: number }[]
      }
      is_child_of_my_household: { Args: { p_member: string }; Returns: boolean }
      can_add_tree_stories: {
        Args: never
        Returns: boolean
      }
      tree_story_fits: {
        Args: { p_family: string; p_person: string; p_teller: string | null }
        Returns: boolean
      }
      create_helper_invite: {
        Args: { p_name: string; p_list: boolean; p_meals: boolean; p_kids: boolean }
        Returns: { helper_id: string; code: string }[]
      }
      renew_helper_invite: {
        Args: { p_helper: string }
        Returns: string
      }
      set_helper_access: {
        Args: { p_helper: string; p_list: boolean; p_meals: boolean; p_kids: boolean }
        Returns: undefined
      }
      remove_helper: {
        Args: { p_helper: string }
        Returns: undefined
      }
      helper_invite_preview: {
        Args: { p_code: string }
        Returns: { household: string; helper_name: string; can_see_list: boolean; can_see_meals: boolean; can_see_kids_plans: boolean }[]
      }
      claim_helper_invite: {
        Args: { p_code: string }
        Returns: string
      }
      my_helper_households: {
        Args: never
        Returns: { helper_id: string; family_id: string; household: string; helper_name: string; time_zone: string; can_see_list: boolean; can_see_meals: boolean; can_see_kids_plans: boolean }[]
      }
      push_test_allowed: {
        Args: { p_kind: string }
        Returns: boolean
      }
      sample_push: {
        Args: { p_kind: string }
        Returns: { title: string; body: string; url: string; tag: string }[]
      }
      forget_household_health_photos: {
        Args: never
        Returns: string[]
      }
      helper_buy_items: {
        Args: { p_family: string }
        Returns: { item_id: string; item_name: string; quantity: number | null; unit: string | null; section: string; checked: boolean; added_by: string | null }[]
      }
      helper_add_buy_item: {
        Args: { p_family: string; p_name: string; p_section: string }
        Returns: string
      }
      helper_tick_buy_item: {
        Args: { p_item: string; p_checked: boolean }
        Returns: undefined
      }
      helper_meals: {
        Args: { p_family: string }
        Returns: { plan_date: string; slot: string; dish: string; meal_position: number }[]
      }
      helper_family_plans: {
        Args: { p_family: string }
        Returns: { title: string; start_at: string; end_at: string | null; repeat: string | null; repeat_days: number[] | null; repeat_until: string | null; place: string | null; children: string[]; for_whole_family: boolean }[]
      }
      children_connections: {
        Args: never
        Returns: { id: string; child_person_id: string; child_name: string; other_person_id: string; other_name: string; other_household: string | null; status: string; requested_at: string }[]
      }
      set_streak_bonus: {
        Args: { p_seven: number; p_thirty: number }
        Returns: undefined
      }
      guardian_decide_connection: {
        Args: { p_id: string; p_approve: boolean }
        Returns: undefined
      }
      guardian_remove_connection: {
        Args: { p_id: string }
        Returns: undefined
      }
      create_chat_group: {
        Args: { p_name: string; p_announce_only: boolean; p_people: string[] }
        Returns: string
      }
      add_chat_group_members: {
        Args: { p_group: string; p_people: string[] }
        Returns: undefined
      }
      remove_chat_group_member: {
        Args: { p_group: string; p_person: string }
        Returns: undefined
      }
      update_chat_group: {
        Args: { p_group: string; p_name: string; p_announce_only: boolean }
        Returns: undefined
      }
      set_chat_group_admin: {
        Args: { p_group: string; p_person: string; p_admin: boolean }
        Returns: undefined
      }
      group_members_of: {
        Args: { p_group: string }
        Returns: { person_id: string; full_name: string; avatar_url: string | null; household_name: string | null; role: string }[]
      }
      group_candidates: {
        Args: never
        Returns: { person_id: string; full_name: string; avatar_url: string | null; household_name: string | null }[]
      }
      dm_seen_at: {
        Args: { p_other: string }
        Returns: string | null
      }
      chat_push_targets_mentioning: {
        Args: { p_thread: string; p_people: string[] }
        Returns: { endpoint: string; p256dh: string; auth: string; mentioned: boolean }[]
      }
      create_group_poll: {
        Args: { p_group: string; p_question: string; p_options: string[]; p_allow_multiple: boolean }
        Returns: string
      }
      due_scheduled_messages: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      due_letter_notifications: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      card_started_push_targets: {
        Args: { p_recipient: string; p_opens: string }
        Returns: { endpoint: string; p256dh: string; auth: string }[]
      }
      linked_tree_stories: {
        Args: { p_person: string }
        Returns: {
          id: string
          family_name: string
          title: string
          body: string | null
          teller: string | null
          happened_on: string | null
          happened_precision: string
          created_by_name: string | null
          created_at: string
          updated_at: string
        }[]
      }
      linked_tree_story_files: {
        Args: { p_person: string }
        Returns: {
          id: string
          story_id: string
          storage_path: string
          mime_type: string
          file_name: string
          transcript: string | null
          position: number
          created_at: string
        }[]
      }
      tree_story_push_targets: {
        Args: { p_story: string; p_new: boolean }
        Returns: { endpoint: string; p256dh: string; auth: string; person_id: string }[]
      }
      save_helper_push: {
        Args: { p_family: string; p_endpoint: string; p_p256dh: string; p_auth: string }
        Returns: undefined
      }
      remove_helper_push: {
        Args: { p_family: string; p_endpoint: string }
        Returns: undefined
      }
      helper_push_saved: {
        Args: { p_family: string; p_endpoint: string }
        Returns: boolean
      }
      helper_push_targets: {
        Args: { p_item: string }
        Returns: { endpoint: string; p256dh: string; auth: string }[]
      }
      forget_helper_push_endpoint: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      my_open_when_letters: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; writer_name: string; open_when: string }[]
      }
      open_letter: {
        Args: { p_id: string }
        Returns: boolean
      }
      time_capsule_can_reply: {
        Args: { p_letter: string; p_to: string }
        Returns: boolean
      }
      open_cards: {
        Args: Record<PropertyKey, never>
        Returns: { recipient_member_id: string; recipient_name: string; opens_on: string; occasion: string; signers: string[] | null; signed_by_me: boolean }[]
      }
      time_capsule_card_open: {
        Args: { p_recipient: string; p_opens: string }
        Returns: boolean
      }
      my_sealed_letters: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; writer_name: string; opens_on: string; occasion: string }[]
      }
      group_seen_by: {
        Args: { p_group: string }
        Returns: { person_id: string; first_name: string; last_read_at: string }[]
      }
      pin_chat_message: {
        Args: { p_kind: string; p_id: string; p_pinned: boolean }
        Returns: undefined
      }
      chat_push_targets: {
        Args: { p_thread: string }
        Returns: { endpoint: string; p256dh: string; auth: string }[]
      }
      my_direct_threads: {
        Args: never
        Returns: { person_id: string; full_name: string; avatar_url: string | null; household_name: string | null; connected: boolean }[]
      }
      my_chat_unread: {
        Args: never
        Returns: { thread: string; unread: number }[]
      }
      my_connections: {
        Args: never
        Returns: { id: string; person_id: string; member_id: string | null; full_name: string | null; avatar_url: string | null; household_name: string | null; status: string; incoming: boolean; via: string; requested_at: string; decided_at: string | null }[]
      }
      connection_candidates: {
        Args: never
        Returns: { person_id: string; member_id: string; full_name: string; avatar_url: string | null; household_name: string; same_household: boolean }[]
      }
      request_connection: {
        Args: { p_person_id: string }
        Returns: string
      }
      request_connection_by_code: {
        Args: { p_code: string }
        Returns: string
      }
      respond_connection: {
        Args: { p_id: string; p_accept: boolean }
        Returns: undefined
      }
      remove_connection: {
        Args: { p_id: string }
        Returns: undefined
      }
      my_connection_code: {
        Args: { p_new?: boolean }
        Returns: string
      }
      are_connected: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      on_family_tree_as_me: {
        Args: { p_family_id: string }
        Returns: boolean
      }
      my_connected_person_ids: {
        Args: never
        Returns: string[]
      }
      person_in_my_tree: {
        Args: { p_person_id: string }
        Returns: boolean
      }
      relative_profile: {
        Args: { p_member_id: string }
        Returns: { member_id: string; full_name: string; avatar_url: string | null; cover_path: string | null; family_id: string; household_name: string; link_id: string | null; match_id: string | null; tree_person_id: string | null; is_shared_person: boolean | null }[]
      }
      due_bill_ahead_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      due_goal_reward_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      due_rsvp_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      potluck_event: {
        Args: { p_event: string }
        Returns: { event_id: string; title: string; event_date: string; end_date: string | null; host_family_id: string; host_name: string; mine: boolean; relatives: boolean; open: boolean }[]
      }
      relatives_potlucks: {
        Args: never
        Returns: { event_id: string; title: string; event_date: string; host_name: string; items: number; open_items: number }[]
      }
      potluck_visible: {
        Args: { p_event: string }
        Returns: boolean
      }
      draw_gift_draw: {
        Args: { p_draw: string }
        Returns: number
      }
      my_gift_draws: {
        Args: never
        Returns: { draw_id: string; title: string; exchange_date: string; host_name: string; mine: boolean; drawn: boolean; people: number; ours: number }[]
      }
      due_remembrance_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      game_log: {
        Args: { p_goal: string; p_steps?: number }
        Returns: undefined
      }
      game_today: { Args: never; Returns: string }
      game_may_log: { Args: { p_goal: string }; Returns: boolean }
      game_period_start: { Args: { p_goal: string }; Returns: string }
      game_settle_my_steps: { Args: never; Returns: undefined }
      game_use_family_treat: { Args: { p_week: string }; Returns: undefined }
      game_steps_days: {
        Args: { p_from: string; p_to: string }
        Returns: { member_id: string; day: string; steps: number }[]
      }
      game_family_steps: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      planner_goal_readings: {
        Args: { p_since: string }
        Returns: { goal_id: string; kind: string; reading_date: string; value: number; created_at: string | null }[]
      }
      planner_goal_visible: {
        Args: { p_goal: string }
        Returns: boolean
      }
      goal_reward_act: {
        Args: { p_goal: string; p_action: string }
        Returns: string
      }
      check_kin_offers: {
        Args: never
        Returns: { code: string; days: number }[]
      }
      claim_start_bonus: {
        Args: never
        Returns: number
      }
      start_bonus_progress: {
        Args: never
        Returns: Json
      }
      next_kin_offer: {
        Args: never
        Returns: { answered_at: string | null; answered_by: string | null; code: string; completed_at: string | null; days: number; expires_at: string; family_id: string; id: string; offered_at: string; status: string }[]
      }
      respond_kin_offer: {
        Args: { p_accept: boolean; p_offer: string }
        Returns: string
      }
      set_referrer: {
        Args: { p_code: string }
        Returns: string
      }
      claim_referral: {
        Args: { p_code: string }
        Returns: string
      }
      referral_stats: {
        Args: never
        Returns: { joined: number; rewarded: number; cap: number }[]
      }
      decide_goal_change: {
        Args: { p_approve: boolean; p_change: string }
        Returns: undefined
      }
      feed_occasions_today: {
        Args: never
        Returns: { event_id: string; family_id: string; household_name: string; title: string; kind: string; years: number | null; is_ours: boolean }[]
      }
      due_money_recap_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      due_week_ahead_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      due_trial_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      // Emergency access to the vault (20261015120000).
      due_vault_emergency_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      dismiss_vault_emergency_notice: {
        Args: { p_notice: string }
        Returns: undefined
      }
      vault_emergency_candidates: {
        Args: never
        Returns: { member_id: string; full_name: string; household_name: string }[]
      }
      name_vault_emergency_contact: {
        Args: { p_member: string; p_wait_days?: number }
        Returns: string
      }
      remove_vault_emergency_contact: {
        Args: { p_contact: string }
        Returns: undefined
      }
      answer_vault_emergency_request: {
        Args: { p_request: string; p_answer: string }
        Returns: string
      }
      request_vault_emergency_access: {
        Args: { p_family: string; p_reason: string }
        Returns: string
      }
      vault_emergency_items: {
        Args: { p_request: string }
        Returns: { kind: string; id: string; grp: string; label: string; owner_name: string | null; file_count: number }[]
      }
      open_vault_emergency_item: {
        Args: { p_request: string; p_kind: string; p_id: string }
        Returns: Json
      }
      vault_emergency_request_list: {
        Args: never
        Returns: {
          id: string
          family_id: string
          family_name: string
          contact_id: string | null
          member_name: string
          member_household_name: string
          reason: string
          wait_days: number
          requested_at: string
          opens_at: string
          ends_at: string
          status: string
          mine: boolean
          answered_by_name: string | null
        }[]
      }
      move_to_household: {
        Args: { p_invite_code: string }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          cover_avatar_id: string | null
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
          moved_at: string | null
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
      start_own_household: {
        Args: { p_household_name: string }
        Returns: {
          allergies: string | null
          auth_user_id: string | null
          avatar_url: string | null
          blood_type: string | null
          college: string | null
          cover_avatar_id: string | null
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
          moved_at: string | null
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
      use_kin_ai: { Args: never; Returns: Json }
      family_storage_bytes: { Args: never; Returns: number }
      expired_highlights: {
        Args: never
        Returns: { id: string; storage_path: string }[]
      }
      forget_expired_highlights: { Args: { p_ids: string[] }; Returns: number }
      due_pantry_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      cron_retry_reminder: {
        Args: { p_secret: string; p_key: string }
        Returns: undefined
      }
      due_missed_dose_alerts: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      medicine_alert_receiver_ok: {
        Args: { p_medicine: string; p_receiver: string }
        Returns: boolean
      }
      due_refill_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      medicine_on_hand: {
        Args: { p_medicine: string }
        Returns: number | null
      }
      add_to_medicine_supply: {
        Args: { p_medicine: string; p_add: number }
        Returns: number
      }
      due_reminders: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      due_dose_repeats: {
        Args: { p_secret: string; p_now?: string }
        Returns: { key: string; member_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string }[]
      }
      cron_forget_endpoint: {
        Args: { p_secret: string; p_endpoint: string }
        Returns: undefined
      }
      set_apple_health_token: {
        Args: { p_token_hash: string; p_visibility: string }
        Returns: undefined
      }
      clear_apple_health_token: {
        Args: never
        Returns: undefined
      }
      apple_health_status: {
        Args: never
        Returns: { connected_at: string; last_used_at: string | null; visibility: string }[]
      }
      ingest_apple_health: {
        Args: { p_token_hash: string; p_samples: Json }
        Returns: number
      }
      answer_checkin: {
        Args: { p_id: string; p_answer: string }
        Returns: string | null
      }
      sos_record_notified: {
        Args: { p_id: string; p_count: number }
        Returns: undefined
      }
      sos_act: {
        Args: { p_id: string; p_action: string }
        Returns: string | null
      }
      forget_push_endpoint: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      push_targets: {
        Args: { p_kind: string; p_member_ids: string[]; p_source: string }
        Returns: { endpoint: string; p256dh: string; auth: string }[]
      }
      today_brief: { Args: { p_hash: string }; Returns: Json }
      set_list_add_token: { Args: { p_token_hash: string }; Returns: undefined }
      set_event_guest_link: { Args: { p_event: string; p_token_hash: string; p_draw?: string | null }; Returns: undefined }
      set_event_guest_link_draw: { Args: { p_event: string; p_draw: string | null }; Returns: undefined }
      clear_event_guest_link: { Args: { p_event: string }; Returns: undefined }
      event_guest_link: {
        Args: { p_event: string }
        Returns: { draw_id: string | null; created_at: string; last_used_at: string | null }[]
      }
      guest_event: {
        Args: { p_token_hash: string }
        Returns: {
          title: string
          event_date: string
          end_date: string | null
          host_name: string
          open: boolean
          coming: number
          guests: number
          draw_id: string | null
          draw_title: string | null
          draw_exchange_date: string | null
          draw_price_cap: number | null
          draw_currency: string | null
          draw_drawn: boolean | null
          draw_open: boolean | null
        }[]
      }
      guest_potluck: {
        Args: { p_token_hash: string }
        Returns: { item_id: string; label: string; wanted: number; taken: number; sort_order: number }[]
      }
      guest_hello: { Args: { p_token_hash: string; p_name: string }; Returns: Json }
      guest_answer: { Args: { p_token_hash: string; p_name: string; p_answer: string | null; p_headcount: number | null }; Returns: Json }
      guest_claim: { Args: { p_token_hash: string; p_name: string; p_item: string; p_qty: number }; Returns: Json }
      guest_add_dish: { Args: { p_token_hash: string; p_name: string; p_label: string; p_wanted: number }; Returns: Json }
      guest_join_draw: { Args: { p_token_hash: string; p_name: string; p_in: boolean }; Returns: Json }
      clear_list_add_token: { Args: never; Returns: undefined }
      list_add_link_on: { Args: never; Returns: boolean }
      set_dose_alarm_token: { Args: { p_token_hash: string }; Returns: undefined }
      clear_dose_alarm_token: { Args: never; Returns: undefined }
      dose_alarm_link_state: { Args: never; Returns: { made_at: string; last_used_at: string | null }[] }
      dose_alarms_by_link: { Args: { p_token_hash: string; p_now?: string }; Returns: Json }
      set_send_to_kin_token: { Args: { p_token_hash: string }; Returns: undefined }
      clear_send_to_kin_token: { Args: never; Returns: undefined }
      send_to_kin_link_on: { Args: never; Returns: boolean }
      send_to_kin_by_link: { Args: { p_token_hash: string; p_mime: string; p_data_base64: string }; Returns: Json }
      request_account_deletion: { Args: never; Returns: Json }
      cancel_account_deletion: { Args: never; Returns: boolean }
      my_account_deletion_plan: { Args: never; Returns: Json }
      due_account_deletions: { Args: never; Returns: string[] }
      due_storage_sweep: { Args: never; Returns: { bucket: string; path: string }[] }
      forget_storage_sweep: { Args: { p_bucket: string; p_paths: string[] }; Returns: number }
      finalize_account_deletion: { Args: { p_user: string }; Returns: Json }
      delete_household_for_account_deletion: { Args: { p_family: string }; Returns: string[] }
      sweep_sent_screenshots: { Args: never; Returns: undefined }
      log_app_error: { Args: { p_fingerprint: string; p_kind: string; p_route: string; p_message: string; p_version: string }; Returns: undefined }
      app_error_digest: {
        Args: { p_days?: number }
        Returns: { fingerprint: string; kind: string; route: string; message: string; app_version: string; count: number; first_seen: string; last_seen: string }[]
      }
      sweep_app_errors: { Args: never; Returns: undefined }
      add_to_list_by_link: { Args: { p_token_hash: string; p_items: Json }; Returns: number }
      calendar_feed: {
        Args: { feed_hash: string }
        Returns: {
          uid: string
          title: string
          starts_at: string | null
          ends_at: string | null
          all_day: string | null
          all_day_end: string | null
          yearly: boolean
          repeat: string | null
          location: string | null
          notes: string | null
          repeat_days: number[] | null
          repeat_until: string | null
          time_zone: string
        }[]
      }
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
      block_tree_offers: {
        Args: { p_match: string }
        Returns: undefined
      }
      unblock_tree_offers: {
        Args: { p_family: string }
        Returns: undefined
      }
      tree_offer_blocks_for_me: {
        Args: Record<PropertyKey, never>
        Returns: {
          family_id: string
          family_name: string
        }[]
      }
      shared_branch_accounts: {
        Args: { match: string }
        Returns: {
          id: string
          has_account: boolean
        }[]
      }
      tree_match_suggestions: {
        Args: Record<PropertyKey, never>
        Returns: {
          person_id: string
          other_family_id: string
          other_family_name: string
          other_person_id: string
          other_name: string
          other_birth_year: string | null
          reason: string
          their_offer_id: string | null
          we_offered: boolean
        }[]
      }
      dismiss_tree_suggestion: {
        Args: { p_person: string; p_other_person: string }
        Returns: undefined
      }
      tree_name_key: {
        Args: { p_name: string }
        Returns: string | null
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
      create_shared_pot: {
        Args: { p_families: string[]; p_note: string | null; p_title: string }
        Returns: string
      }
      set_shared_pot_share: {
        Args: { p_family: string; p_pot: string; p_share: number }
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
          cover_avatar_id: string | null
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
          cover_avatar_id: string | null
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
          cover_avatar_id: string | null
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
          p_chosen_plan?: string
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
          cover_avatar_id: string | null
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
      current_person_id: { Args: never; Returns: string }
      current_member_is_organiser: { Args: never; Returns: boolean }
      current_member_role: { Args: never; Returns: string }
      delete_household: { Args: never; Returns: undefined }
      delete_remittance: { Args: { p_id: string }; Returns: undefined }
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
          cover_avatar_id: string | null
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
          moved_at: string | null
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
      log_remittance: {
        Args: {
          p_account_id: string | null
          p_allocations: Json
          p_amount: number
          p_channel: string
          p_channel_name: string | null
          p_currency: string
          p_ecb_rate: number | null
          p_ecb_rate_date: string | null
          p_is_private: boolean
          p_note: string | null
          p_php_received: number
          p_rate_source: string | null
          p_receiver_member_id: string | null
          p_sender_member_id: string | null
          p_sender_name: string | null
          p_sent_on: string
        }
        Returns: string
      }
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
