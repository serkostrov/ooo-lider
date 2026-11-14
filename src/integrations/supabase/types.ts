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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      user_settings: {
        Row: {
          key: string
          profile_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          profile_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          profile_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          position: string | null
          sort: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          position?: string | null
          sort?: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          position?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          comment: string | null
          created_at: string
          deleted_at: string | null
          id: string
          inn: string | null
          kpp: string | null
          legal_address: string | null
          name: string
          ogrn: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          inn?: string | null
          kpp?: string | null
          legal_address?: string | null
          name: string
          ogrn?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          inn?: string | null
          kpp?: string | null
          legal_address?: string | null
          name?: string
          ogrn?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          comment: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          section: string
          sort: number
          stage_template_id: string | null
          to_id_folder: boolean
        }
        Insert: {
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          section: string
          sort?: number
          stage_template_id?: string | null
          to_id_folder?: boolean
        }
        Update: {
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          section?: string
          sort?: number
          stage_template_id?: string | null
          to_id_folder?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "documents_stage_template_fk"
            columns: ["stage_template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          id: string
          kind: string
          mime_type: string | null
          object_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          id?: string
          kind?: string
          mime_type?: string | null
          object_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string | null
          object_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          message: string
          object_id: string | null
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          message: string
          object_id?: string | null
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          message?: string
          object_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      object_members: {
        Row: {
          created_at: string
          object_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          object_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          object_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_members_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_members_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      object_stage_conditions: {
        Row: {
          deleted_at: string | null
          document_id: string | null
          done_at: string | null
          done_by: string | null
          id: string
          is_done: boolean
          is_required: boolean
          kind: string
          sort: number
          stage_id: string
          title: string
          to_id_folder: boolean
          value_text: string | null
        }
        Insert: {
          deleted_at?: string | null
          document_id?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_done?: boolean
          is_required?: boolean
          kind?: string
          sort?: number
          stage_id: string
          title: string
          to_id_folder?: boolean
          value_text?: string | null
        }
        Update: {
          deleted_at?: string | null
          document_id?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_done?: boolean
          is_required?: boolean
          kind?: string
          sort?: number
          stage_id?: string
          title?: string
          to_id_folder?: boolean
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_stage_conditions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_conditions_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_conditions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_conditions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_object_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      object_stage_predecessors: {
        Row: {
          predecessor_id: string
          stage_id: string
        }
        Insert: {
          predecessor_id: string
          stage_id: string
        }
        Update: {
          predecessor_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_stage_predecessors_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_predecessors_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "v_object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_predecessors_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_predecessors_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_object_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      object_stage_steps: {
        Row: {
          action: string
          action_kind: string
          assignee_id: string | null
          comment: string | null
          done_at: string | null
          done_by: string | null
          duration_days: number | null
          id: string
          role_code: string
          stage_id: string
          state: string
          step_no: number
        }
        Insert: {
          action: string
          action_kind?: string
          assignee_id?: string | null
          comment?: string | null
          done_at?: string | null
          done_by?: string | null
          duration_days?: number | null
          id?: string
          role_code: string
          stage_id: string
          state?: string
          step_no: number
        }
        Update: {
          action?: string
          action_kind?: string
          assignee_id?: string | null
          comment?: string | null
          done_at?: string | null
          done_by?: string | null
          duration_days?: number | null
          id?: string
          role_code?: string
          stage_id?: string
          state?: string
          step_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_stage_steps_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_steps_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_steps_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "object_stage_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stage_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_object_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      object_stages: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          code: string
          coexecutor_id: string | null
          confirmer_id: string | null
          confirmer_role: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          doc_sent_at: string | null
          due_date: string | null
          duration_days: number | null
          executor_id: string | null
          expected_doc: string | null
          id: string
          is_critical: boolean
          is_excluded: boolean
          name: string
          note: string | null
          number: number
          object_id: string
          out_of_order: boolean
          outgoing_doc: string | null
          parent_id: string | null
          remind_days: number | null
          response_days: number | null
          response_due: string | null
          response_received_at: string | null
          return_reason: string | null
          sort: number
          start_date: string | null
          status_code: string
          template_id: string | null
          updated_at: string
          work_type_id: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          coexecutor_id?: string | null
          confirmer_id?: string | null
          confirmer_role?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          doc_sent_at?: string | null
          due_date?: string | null
          duration_days?: number | null
          executor_id?: string | null
          expected_doc?: string | null
          id?: string
          is_critical?: boolean
          is_excluded?: boolean
          name: string
          note?: string | null
          number: number
          object_id: string
          out_of_order?: boolean
          outgoing_doc?: string | null
          parent_id?: string | null
          remind_days?: number | null
          response_days?: number | null
          response_due?: string | null
          response_received_at?: string | null
          return_reason?: string | null
          sort?: number
          start_date?: string | null
          status_code?: string
          template_id?: string | null
          updated_at?: string
          work_type_id?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          coexecutor_id?: string | null
          confirmer_id?: string | null
          confirmer_role?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          doc_sent_at?: string | null
          due_date?: string | null
          duration_days?: number | null
          executor_id?: string | null
          expected_doc?: string | null
          id?: string
          is_critical?: boolean
          is_excluded?: boolean
          name?: string
          note?: string | null
          number?: number
          object_id?: string
          out_of_order?: boolean
          outgoing_doc?: string | null
          parent_id?: string | null
          remind_days?: number | null
          response_days?: number | null
          response_due?: string | null
          response_received_at?: string | null
          return_reason?: string | null
          sort?: number
          start_date?: string | null
          status_code?: string
          template_id?: string | null
          updated_at?: string
          work_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_stages_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_coexecutor_id_fkey"
            columns: ["coexecutor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_confirmer_id_fkey"
            columns: ["confirmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_confirmer_role_fkey"
            columns: ["confirmer_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "object_stages_executor_id_fkey"
            columns: ["executor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_status_code_fkey"
            columns: ["status_code"]
            isOneToOne: false
            referencedRelation: "stage_statuses"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "object_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      object_types: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          name: string
          sort: number
        }
        Insert: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          name: string
          sort?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          name?: string
          sort?: number
        }
        Relationships: []
      }
      objects: {
        Row: {
          address: string | null
          completed_at: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          created_by: string | null
          curator_contact_id: string | null
          customer_id: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          object_type: string
          responsible_id: string | null
          status: string
          technadzor_contact_id: string | null
          technadzor_ehz_contact_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          completed_at?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          curator_contact_id?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          object_type?: string
          responsible_id?: string | null
          status?: string
          technadzor_contact_id?: string | null
          technadzor_ehz_contact_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          completed_at?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          curator_contact_id?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          object_type?: string
          responsible_id?: string | null
          status?: string
          technadzor_contact_id?: string | null
          technadzor_ehz_contact_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_curator_contact_id_fkey"
            columns: ["curator_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_technadzor_contact_id_fkey"
            columns: ["technadzor_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_technadzor_ehz_contact_id_fkey"
            columns: ["technadzor_ehz_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role_code: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_code: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_code?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      representatives: {
        Row: {
          comment: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          sort: number
        }
        Insert: {
          comment?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          sort?: number
        }
        Update: {
          comment?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          sort?: number
        }
        Relationships: []
      }
      request_comments: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          request_id: string
          text: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: string
          request_id: string
          text: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          request_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "v_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_field_values: {
        Row: {
          field_id: string
          field_type: string
          label: string
          request_id: string
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          field_id: string
          field_type: string
          label: string
          request_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          field_id?: string
          field_type?: string
          label?: string
          request_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "request_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "request_type_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_field_values_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_field_values_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "v_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_field_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_statuses: {
        Row: {
          action_label: string
          code: string
          color: string
          name: string
          sort: number
        }
        Insert: {
          action_label: string
          code: string
          color: string
          name: string
          sort: number
        }
        Update: {
          action_label?: string
          code?: string
          color?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      request_type_fields: {
        Row: {
          deleted_at: string | null
          field_type: string
          filled_by: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json
          request_type_id: string
          sort: number
        }
        Insert: {
          deleted_at?: string | null
          field_type: string
          filled_by?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json
          request_type_id: string
          sort?: number
        }
        Update: {
          deleted_at?: string | null
          field_type?: string
          filled_by?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json
          request_type_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_type_fields_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
        ]
      }
      request_type_scenario_step_fields: {
        Row: {
          field_id: string
          step_id: string
        }
        Insert: {
          field_id: string
          step_id: string
        }
        Update: {
          field_id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_type_scenario_step_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "request_type_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_scenario_step_fields_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "request_type_scenario_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      request_type_scenario_steps: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          request_type_id: string
          role_code: string
          sort: number
          step_no: number
          to_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          request_type_id: string
          role_code: string
          sort?: number
          step_no: number
          to_status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          request_type_id?: string
          role_code?: string
          sort?: number
          step_no?: number
          to_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_type_scenario_steps_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_type_scenario_steps_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      request_types: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          send_to_email: string | null
          sort: number
          uses_representatives: boolean
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          send_to_email?: string | null
          sort?: number
          uses_representatives?: boolean
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          send_to_email?: string | null
          sort?: number
          uses_representatives?: boolean
        }
        Relationships: []
      }
      requests: {
        Row: {
          accepted_at: string | null
          call_date: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          done_at: string | null
          done_by: string | null
          id: string
          initiator_id: string | null
          number: number
          object_id: string
          office_id: string | null
          representative_id: string | null
          request_type_id: string
          result_text: string | null
          seen_at: string | null
          sent_at: string | null
          stage_id: string | null
          status: string
          type_name: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          call_date: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          initiator_id?: string | null
          number?: number
          object_id: string
          office_id?: string | null
          representative_id?: string | null
          request_type_id: string
          result_text?: string | null
          seen_at?: string | null
          sent_at?: string | null
          stage_id?: string | null
          status?: string
          type_name: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          call_date?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          initiator_id?: string | null
          number?: number
          object_id?: string
          office_id?: string | null
          representative_id?: string | null
          request_type_id?: string
          result_text?: string | null
          seen_at?: string | null
          sent_at?: string | null
          stage_id?: string | null
          status?: string
          type_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "representatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_object_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          is_admin: boolean
          name: string
          required_on_object_create: boolean
          sort: number
        }
        Insert: {
          code: string
          is_admin?: boolean
          name: string
          required_on_object_create?: boolean
          sort?: number
        }
        Update: {
          code?: string
          is_admin?: boolean
          name?: string
          required_on_object_create?: boolean
          sort?: number
        }
        Relationships: []
      }
      stage_statuses: {
        Row: {
          code: string
          color: string
          is_closed: boolean
          name: string
          sort: number
        }
        Insert: {
          code: string
          color: string
          is_closed?: boolean
          name: string
          sort: number
        }
        Update: {
          code?: string
          color?: string
          is_closed?: boolean
          name?: string
          sort?: number
        }
        Relationships: []
      }
      stage_template_conditions: {
        Row: {
          deleted_at: string | null
          document_id: string | null
          id: string
          is_required: boolean
          kind: string
          sort: number
          template_id: string
          title: string
          to_id_folder: boolean
        }
        Insert: {
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          is_required?: boolean
          kind?: string
          sort?: number
          template_id: string
          title: string
          to_id_folder?: boolean
        }
        Update: {
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          is_required?: boolean
          kind?: string
          sort?: number
          template_id?: string
          title?: string
          to_id_folder?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stage_template_conditions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_template_conditions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_template_predecessors: {
        Row: {
          predecessor_id: string
          template_id: string
        }
        Insert: {
          predecessor_id: string
          template_id: string
        }
        Update: {
          predecessor_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_template_predecessors_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_template_predecessors_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_template_steps: {
        Row: {
          action: string
          action_kind: string
          deleted_at: string | null
          duration_days: number | null
          id: string
          role_code: string
          step_no: number
          template_id: string
        }
        Insert: {
          action: string
          action_kind?: string
          deleted_at?: string | null
          duration_days?: number | null
          id?: string
          role_code: string
          step_no: number
          template_id: string
        }
        Update: {
          action?: string
          action_kind?: string
          deleted_at?: string | null
          duration_days?: number | null
          id?: string
          role_code?: string
          step_no?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_template_steps_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stage_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_template_files: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_name: string
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          template_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_name: string
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          template_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          template_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_template_files_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_template_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_templates: {
        Row: {
          confirmer_role: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_days: number | null
          executor_role: string | null
          expected_doc: string | null
          id: string
          is_active: boolean
          is_critical: boolean
          name: string
          number: number
          outgoing_doc: string | null
          remind_days: number | null
          response_days: number | null
          sort: number
          updated_at: string
          work_type_id: string | null
        }
        Insert: {
          confirmer_role?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_days?: number | null
          executor_role?: string | null
          expected_doc?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
          name: string
          number: number
          outgoing_doc?: string | null
          remind_days?: number | null
          response_days?: number | null
          sort?: number
          updated_at?: string
          work_type_id?: string | null
        }
        Update: {
          confirmer_role?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_days?: number | null
          executor_role?: string | null
          expected_doc?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
          name?: string
          number?: number
          outgoing_doc?: string | null
          remind_days?: number | null
          response_days?: number | null
          sort?: number
          updated_at?: string
          work_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_templates_confirmer_role_fkey"
            columns: ["confirmer_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stage_templates_executor_role_fkey"
            columns: ["executor_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stage_templates_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      work_types: {
        Row: {
          deleted_at: string | null
          id: string
          name: string
          sort: number
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          name: string
          sort?: number
        }
        Update: {
          deleted_at?: string | null
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_object_stages: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          code: string | null
          coexecutor_id: string | null
          coexecutor_name: string | null
          conditions_done: number | null
          conditions_total: number | null
          confirmer_id: string | null
          confirmer_name: string | null
          confirmer_role: string | null
          confirmer_role_name: string | null
          created_at: string | null
          current_step_action: string | null
          current_step_role: string | null
          days_left: number | null
          deleted_at: string | null
          description: string | null
          doc_sent_at: string | null
          due_date: string | null
          duration_days: number | null
          executor_id: string | null
          executor_name: string | null
          expected_doc: string | null
          id: string | null
          is_closed: boolean | null
          is_critical: boolean | null
          is_due_soon: boolean | null
          is_excluded: boolean | null
          is_no_executor: boolean | null
          is_no_response: boolean | null
          is_overdue: boolean | null
          name: string | null
          note: string | null
          number: number | null
          object_id: string | null
          out_of_order: boolean | null
          outgoing_doc: string | null
          parent_code: string | null
          parent_id: string | null
          parent_name: string | null
          remind_days: number | null
          response_days: number | null
          response_due: string | null
          response_received_at: string | null
          return_reason: string | null
          sort: number | null
          start_date: string | null
          status_code: string | null
          status_color: string | null
          status_name: string | null
          template_id: string | null
          updated_at: string | null
          work_type_id: string | null
          work_type_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_stages_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_coexecutor_id_fkey"
            columns: ["coexecutor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_confirmer_id_fkey"
            columns: ["confirmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_confirmer_role_fkey"
            columns: ["confirmer_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "object_stages_executor_id_fkey"
            columns: ["executor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_status_code_fkey"
            columns: ["status_code"]
            isOneToOne: false
            referencedRelation: "stage_statuses"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "object_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_stages_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      v_objects: {
        Row: {
          address: string | null
          completed_at: string | null
          contract_days_left: number | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          created_by: string | null
          curator_contact_id: string | null
          curator_name: string | null
          current_stage_name: string | null
          current_stage_number: number | null
          customer_id: string | null
          customer_name: string | null
          deleted_at: string | null
          id: string | null
          name: string | null
          notes: string | null
          object_type: string | null
          progress_pct: number | null
          requests_new: number | null
          requests_overdue: number | null
          responsible_id: string | null
          responsible_name: string | null
          stages_closed: number | null
          stages_no_executor: number | null
          stages_no_response: number | null
          stages_on_review: number | null
          stages_overdue: number | null
          stages_total: number | null
          status: string | null
          technadzor_contact_id: string | null
          technadzor_ehz_contact_id: string | null
          technadzor_ehz_name: string | null
          technadzor_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_requests: {
        Row: {
          accepted_at: string | null
          call_date: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          done_at: string | null
          done_by: string | null
          id: string | null
          initiator_id: string | null
          initiator_name: string | null
          is_new: boolean | null
          is_overdue: boolean | null
          number: number | null
          object_id: string | null
          object_name: string | null
          office_id: string | null
          office_name: string | null
          representative_id: string | null
          representative_name: string | null
          request_type_id: string | null
          result_text: string | null
          seen_at: string | null
          sent_at: string | null
          stage_id: string | null
          status: string | null
          type_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "v_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "representatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "object_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_object_stages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_object_stages: {
        Args: { p_object_id: string; p_template_ids: string[] }
        Returns: number
      }
      add_object_substage: {
        Args: {
          p_parent_id: string
          p_name: string
          p_description?: string
          p_executor_id?: string
          p_duration_days?: number
          p_confirmer_role?: string
          p_work_type_id?: string
        }
        Returns: string
      }
      can_see_object: { Args: { p_object_id: string }; Returns: boolean }
      create_object: {
        Args: {
          p_member_ids: string[]
          p_object: Json
          p_template_ids: string[]
        }
        Returns: string
      }
      current_profile_id: { Args: never; Returns: string }
      delete_object_stage: { Args: { p_stage_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      log_history: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_message: string
          p_object_id: string
          p_payload?: Json
        }
        Returns: undefined
      }
      msk_today: { Args: never; Returns: string }
      reorder_object_stages: {
        Args: { p_object_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      request_create: {
        Args: {
          p_call_date: string
          p_object_id: string
          p_representative_id?: string
          p_request_type_id: string
          p_stage_id?: string
          p_values?: Json
        }
        Returns: string
      }
      request_mark_seen: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      request_save_values: {
        Args: { p_request_id: string; p_values: Json }
        Returns: undefined
      }
      request_set_call_date: {
        Args: { p_call_date: string; p_comment: string; p_request_id: string }
        Returns: undefined
      }
      request_set_status: {
        Args: { p_comment?: string; p_request_id: string; p_status: string }
        Returns: undefined
      }
      stage_condition_set: {
        Args: { p_condition_id: string; p_done: boolean; p_value?: string }
        Returns: undefined
      }
      stage_set_excluded: {
        Args: { p_excluded: boolean; p_stage_id: string }
        Returns: undefined
      }
      stage_set_status: {
        Args: { p_comment?: string; p_stage_id: string; p_status: string }
        Returns: undefined
      }
      stage_step_complete: {
        Args: { p_comment?: string; p_step_id: string }
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
