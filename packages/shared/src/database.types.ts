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
      access_log: {
        Row: {
          id: number
          project_id: string
          purpose: Database["public"]["Enums"]["access_purpose"]
          subject: Database["public"]["Enums"]["access_subject"]
          subject_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: never
          project_id: string
          purpose: Database["public"]["Enums"]["access_purpose"]
          subject: Database["public"]["Enums"]["access_subject"]
          subject_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: never
          project_id?: string
          purpose?: Database["public"]["Enums"]["access_purpose"]
          subject?: Database["public"]["Enums"]["access_subject"]
          subject_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_log_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          created_at: string
          granted_at: string
          id: string
          kind: Database["public"]["Enums"]["consent_kind"]
          organization_id: string
          owns_device: boolean | null
          owns_vehicle: boolean | null
          revoked_at: string | null
          statement_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string
          id?: string
          kind: Database["public"]["Enums"]["consent_kind"]
          organization_id: string
          owns_device?: boolean | null
          owns_vehicle?: boolean | null
          revoked_at?: string | null
          statement_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["consent_kind"]
          organization_id?: string
          owns_device?: boolean | null
          owns_vehicle?: boolean | null
          revoked_at?: string | null
          statement_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custody_events: {
        Row: {
          actor_id: string | null
          actor_org_id: string | null
          clock_skew_flag: boolean
          created_at: string
          id: string
          location: unknown
          location_name: string | null
          location_precision_m: number | null
          notes: string | null
          occurred_at: string
          occurred_tz: string | null
          payload: Json
          project_id: string
          received_at: string
          replaces_with_id: string | null
          source: Database["public"]["Enums"]["event_source"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          supersedes_id: string | null
          token_version: number | null
          token_was_voided: boolean
          trip_id: string | null
          type: Database["public"]["Enums"]["event_type"]
          zone_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_org_id?: string | null
          clock_skew_flag?: boolean
          created_at?: string
          id: string
          location?: unknown
          location_name?: string | null
          location_precision_m?: number | null
          notes?: string | null
          occurred_at: string
          occurred_tz?: string | null
          payload?: Json
          project_id: string
          received_at?: string
          replaces_with_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          supersedes_id?: string | null
          token_version?: number | null
          token_was_voided?: boolean
          trip_id?: string | null
          type: Database["public"]["Enums"]["event_type"]
          zone_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_org_id?: string | null
          clock_skew_flag?: boolean
          created_at?: string
          id?: string
          location?: unknown
          location_name?: string | null
          location_precision_m?: number | null
          notes?: string | null
          occurred_at?: string
          occurred_tz?: string | null
          payload?: Json
          project_id?: string
          received_at?: string
          replaces_with_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          supersedes_id?: string | null
          token_version?: number | null
          token_was_voided?: boolean
          trip_id?: string | null
          type?: Database["public"]["Enums"]["event_type"]
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custody_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_actor_org_id_fkey"
            columns: ["actor_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_replaces_with_id_fkey"
            columns: ["replaces_with_id"]
            isOneToOne: false
            referencedRelation: "custody_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "custody_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          filename: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string | null
          project_id: string
          release_id: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string | null
          project_id: string
          release_id?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string | null
          project_id?: string
          release_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "shipping_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_evidence: {
        Row: {
          event_id: string
          evidence_id: string
        }
        Insert: {
          event_id: string
          evidence_id: string
        }
        Update: {
          event_id?: string
          evidence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_evidence_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "custody_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          captured_at: string
          captured_by: string | null
          created_at: string
          form_data: Json | null
          id: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          project_id: string
          storage_path: string | null
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          form_data?: Json | null
          id?: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          project_id: string
          storage_path?: string | null
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          form_data?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["evidence_kind"]
          project_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_jobs: {
        Row: {
          candidates: Json
          created_at: string
          document_id: string
          error: string | null
          finished_at: string | null
          id: string
          method: string | null
          pages: number | null
          project_id: string
          release_id: string | null
          requested_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["extraction_status"]
        }
        Insert: {
          candidates?: Json
          created_at?: string
          document_id: string
          error?: string | null
          finished_at?: string | null
          id?: string
          method?: string | null
          pages?: number | null
          project_id: string
          release_id?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["extraction_status"]
        }
        Update: {
          candidates?: Json
          created_at?: string
          document_id?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          method?: string | null
          pages?: number | null
          project_id?: string
          release_id?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["extraction_status"]
        }
        Relationships: [
          {
            foreignKeyName: "extraction_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "shipping_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          name: string
          project_id: string
          required: boolean
          schema: Json
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          name: string
          project_id: string
          required?: boolean
          schema: Json
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          name?: string
          project_id?: string
          required?: boolean
          schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      handling_units: {
        Row: {
          created_at: string
          created_by: string | null
          current_location_name: string | null
          current_project_id: string
          current_shipment_id: string | null
          current_status: Database["public"]["Enums"]["custody_status"]
          current_zone_id: string | null
          description: string
          height_m: number | null
          id: string
          kind: string
          length_m: number | null
          parent_unit_id: string | null
          release_id: string | null
          search: unknown
          short_code: string
          status_event_id: string | null
          updated_at: string
          weight_kg: number | null
          width_m: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_location_name?: string | null
          current_project_id: string
          current_shipment_id?: string | null
          current_status?: Database["public"]["Enums"]["custody_status"]
          current_zone_id?: string | null
          description?: string
          height_m?: number | null
          id?: string
          kind?: string
          length_m?: number | null
          parent_unit_id?: string | null
          release_id?: string | null
          search?: unknown
          short_code: string
          status_event_id?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_m?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_location_name?: string | null
          current_project_id?: string
          current_shipment_id?: string | null
          current_status?: Database["public"]["Enums"]["custody_status"]
          current_zone_id?: string | null
          description?: string
          height_m?: number | null
          id?: string
          kind?: string
          length_m?: number | null
          parent_unit_id?: string | null
          release_id?: string | null
          search?: unknown
          short_code?: string
          status_event_id?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "handling_units_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handling_units_current_project_id_fkey"
            columns: ["current_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handling_units_current_shipment_id_fkey"
            columns: ["current_shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handling_units_current_zone_id_fkey"
            columns: ["current_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handling_units_parent_unit_id_fkey"
            columns: ["parent_unit_id"]
            isOneToOne: false
            referencedRelation: "handling_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handling_units_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "shipping_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          affected_projects: string[]
          created_at: string
          discovered_at: string
          harm_assessment: Json
          id: string
          individuals_notified_at: string | null
          occurred_at: string | null
          organization_id: string
          reported_by: string | null
          reported_to_commissioner_at: string | null
          status: Database["public"]["Enums"]["incident_status"]
          summary: string
          updated_at: string
        }
        Insert: {
          affected_projects?: string[]
          created_at?: string
          discovered_at?: string
          harm_assessment?: Json
          id?: string
          individuals_notified_at?: string | null
          occurred_at?: string | null
          organization_id: string
          reported_by?: string | null
          reported_to_commissioner_at?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          summary: string
          updated_at?: string
        }
        Update: {
          affected_projects?: string[]
          created_at?: string
          discovered_at?: string
          harm_assessment?: Json
          id?: string
          individuals_notified_at?: string | null
          occurred_at?: string | null
          organization_id?: string
          reported_by?: string | null
          reported_to_commissioner_at?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pings: {
        Row: {
          device_token: string
          id: number
          point: unknown
          precision_m: number | null
          received_at: string
          recorded_at: string
          trip_id: string
        }
        Insert: {
          device_token: string
          id?: never
          point: unknown
          precision_m?: number | null
          received_at?: string
          recorded_at: string
          trip_id: string
        }
        Update: {
          device_token?: string
          id?: never
          point?: unknown
          precision_m?: number | null
          received_at?: string
          recorded_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_acknowledgments: {
        Row: {
          acknowledged_at: string
          id: string
          notice_version_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          notice_version_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          notice_version_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_acknowledgments_notice_version_id_fkey"
            columns: ["notice_version_id"]
            isOneToOne: false
            referencedRelation: "notice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_versions: {
        Row: {
          body_md: string
          created_at: string
          effective_at: string
          id: string
          jurisdiction: string
          organization_id: string | null
          purposes: string[]
          title: string
          version: number
        }
        Insert: {
          body_md: string
          created_at?: string
          effective_at?: string
          id?: string
          jurisdiction: string
          organization_id?: string | null
          purposes?: string[]
          title: string
          version: number
        }
        Update: {
          body_md?: string
          created_at?: string
          effective_at?: string
          id?: string
          jurisdiction?: string
          organization_id?: string | null
          purposes?: string[]
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notice_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_roster: {
        Row: {
          approach_rings: boolean
          exceptions: boolean
          project_id: string
          user_id: string
          zone_id: string
        }
        Insert: {
          approach_rings?: boolean
          exceptions?: boolean
          project_id: string
          user_id: string
          zone_id: string
        }
        Update: {
          approach_rings?: boolean
          exceptions?: boolean
          project_id?: string
          user_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_roster_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_roster_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_roster_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          claimed_at: string | null
          contact_email: string | null
          created_at: string
          dpa_signed_at: string | null
          hosting_region: string
          id: string
          is_placeholder: boolean
          jurisdiction: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          retention_days_events: number | null
          retention_days_pings: number
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          contact_email?: string | null
          created_at?: string
          dpa_signed_at?: string | null
          hosting_region?: string
          id?: string
          is_placeholder?: boolean
          jurisdiction?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name: string
          retention_days_events?: number | null
          retention_days_pings?: number
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          contact_email?: string | null
          created_at?: string
          dpa_signed_at?: string | null
          hosting_region?: string
          id?: string
          is_placeholder?: boolean
          jurisdiction?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name?: string
          retention_days_events?: number | null
          retention_days_pings?: number
          updated_at?: string
        }
        Relationships: []
      }
      po_lines: {
        Row: {
          currency: string | null
          description: string
          id: string
          line_no: number
          piece_mark: string | null
          po_id: string
          qty: number
          unit_price: number | null
          uom: string
        }
        Insert: {
          currency?: string | null
          description: string
          id?: string
          line_no: number
          piece_mark?: string | null
          po_id: string
          qty?: number
          unit_price?: number | null
          uom?: string
        }
        Update: {
          currency?: string | null
          description?: string
          id?: string
          line_no?: number
          piece_mark?: string | null
          po_id?: string
          qty?: number
          unit_price?: number | null
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          locale: string
          org_role: Database["public"]["Enums"]["org_role"]
          organization_id: string | null
          phone_e164: string | null
          pseudonymised_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          locale?: string
          org_role?: Database["public"]["Enums"]["org_role"]
          organization_id?: string | null
          phone_e164?: string | null
          pseudonymised_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          org_role?: Database["public"]["Enums"]["org_role"]
          organization_id?: string | null
          phone_e164?: string | null
          pseudonymised_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_organizations: {
        Row: {
          created_at: string
          invited_by: string | null
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_organizations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_organizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          approach_rings: Json
          archived_at: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          owner_org_id: string
          site_point: unknown
          timezone: string
          updated_at: string
        }
        Insert: {
          approach_rings?: Json
          archived_at?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          owner_org_id: string
          site_point?: unknown
          timezone?: string
          updated_at?: string
        }
        Update: {
          approach_rings?: Json
          archived_at?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_org_id?: string
          site_point?: unknown
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          issued_at: string | null
          notes: string | null
          number: string
          project_id: string
          supplier_org_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          issued_at?: string | null
          notes?: string | null
          number: string
          project_id: string
          supplier_org_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string
          project_id?: string
          supplier_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_org_id_fkey"
            columns: ["supplier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          expo_token: string
          platform: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_token: string
          platform: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_token?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          reprint_reason: string | null
          subject_id: string
          subject_type: string
          token: string
          version: number
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          reprint_reason?: string | null
          subject_id: string
          subject_type: string
          token?: string
          version?: number
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          reprint_reason?: string | null
          subject_id?: string
          subject_type?: string
          token?: string
          version?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      release_lines: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          description: string
          id: string
          line_no: number
          piece_mark: string | null
          po_line_id: string | null
          provenance: Database["public"]["Enums"]["content_provenance"]
          qty: number
          raw_text: string | null
          release_id: string
          search: unknown
          source_page: number | null
          uom: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          description: string
          id?: string
          line_no: number
          piece_mark?: string | null
          po_line_id?: string | null
          provenance?: Database["public"]["Enums"]["content_provenance"]
          qty?: number
          raw_text?: string | null
          release_id: string
          search?: unknown
          source_page?: number | null
          uom?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          description?: string
          id?: string
          line_no?: number
          piece_mark?: string | null
          po_line_id?: string | null
          provenance?: Database["public"]["Enums"]["content_provenance"]
          qty?: number
          raw_text?: string | null
          release_id?: string
          search?: unknown
          source_page?: number | null
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_lines_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_lines_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "shipping_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      role_event_permissions: {
        Row: {
          event_type: Database["public"]["Enums"]["event_type"]
          role: Database["public"]["Enums"]["project_role"]
        }
        Insert: {
          event_type: Database["public"]["Enums"]["event_type"]
          role: Database["public"]["Enums"]["project_role"]
        }
        Update: {
          event_type?: Database["public"]["Enums"]["event_type"]
          role?: Database["public"]["Enums"]["project_role"]
        }
        Relationships: []
      }
      shipment_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          shipment_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          shipment_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          shipment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_assignments_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_updates: {
        Row: {
          author_id: string
          created_at: string
          eta_at: string | null
          id: string
          kind: Database["public"]["Enums"]["update_kind"]
          project_id: string
          shipment_id: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string
          eta_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["update_kind"]
          project_id: string
          shipment_id: string
          text?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          eta_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["update_kind"]
          project_id?: string
          shipment_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_updates_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier_org_id: string | null
          created_at: string
          created_by: string | null
          current_status: Database["public"]["Enums"]["custody_status"]
          destination_point: unknown
          destination_zone_id: string | null
          id: string
          origin_point: unknown
          origin_text: string | null
          planned_delivery_at: string | null
          planned_pickup_at: string | null
          project_id: string
          release_id: string | null
          split_from_id: string | null
          status_event_id: string | null
          updated_at: string
        }
        Insert: {
          carrier_org_id?: string | null
          created_at?: string
          created_by?: string | null
          current_status?: Database["public"]["Enums"]["custody_status"]
          destination_point?: unknown
          destination_zone_id?: string | null
          id?: string
          origin_point?: unknown
          origin_text?: string | null
          planned_delivery_at?: string | null
          planned_pickup_at?: string | null
          project_id: string
          release_id?: string | null
          split_from_id?: string | null
          status_event_id?: string | null
          updated_at?: string
        }
        Update: {
          carrier_org_id?: string | null
          created_at?: string
          created_by?: string | null
          current_status?: Database["public"]["Enums"]["custody_status"]
          destination_point?: unknown
          destination_zone_id?: string | null
          id?: string
          origin_point?: unknown
          origin_text?: string | null
          planned_delivery_at?: string | null
          planned_pickup_at?: string | null
          project_id?: string
          release_id?: string | null
          split_from_id?: string | null
          status_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_carrier_org_id_fkey"
            columns: ["carrier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_destination_zone_id_fkey"
            columns: ["destination_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "shipping_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_split_from_id_fkey"
            columns: ["split_from_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_releases: {
        Row: {
          created_at: string
          id: string
          issued_at: string
          issued_by: string | null
          notes: string | null
          number: string
          po_id: string | null
          project_id: string
          supplier_org_id: string
          supplier_ref: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          notes?: string | null
          number: string
          po_id?: string | null
          project_id: string
          supplier_org_id: string
          supplier_ref?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          notes?: string | null
          number?: string
          po_id?: string | null
          project_id?: string
          supplier_org_id?: string
          supplier_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_releases_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_releases_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_releases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_releases_supplier_org_id_fkey"
            columns: ["supplier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      status_precedence: {
        Row: {
          event_type: Database["public"]["Enums"]["event_type"]
          rank: number
          status: Database["public"]["Enums"]["custody_status"]
        }
        Insert: {
          event_type: Database["public"]["Enums"]["event_type"]
          rank: number
          status: Database["public"]["Enums"]["custody_status"]
        }
        Update: {
          event_type?: Database["public"]["Enums"]["event_type"]
          rank?: number
          status?: Database["public"]["Enums"]["custody_status"]
        }
        Relationships: []
      }
      trips: {
        Row: {
          arrived_at: string | null
          checkin_interval_minutes: number | null
          created_at: string
          delivered_at: string | null
          device_token: string
          driver_id: string
          end_reason: Database["public"]["Enums"]["trip_end_reason"] | null
          ended_at: string | null
          id: string
          last_ping_at: string | null
          max_duration_minutes: number
          mode: Database["public"]["Enums"]["tracking_mode"]
          project_id: string
          shipment_id: string
          started_at: string
        }
        Insert: {
          arrived_at?: string | null
          checkin_interval_minutes?: number | null
          created_at?: string
          delivered_at?: string | null
          device_token?: string
          driver_id: string
          end_reason?: Database["public"]["Enums"]["trip_end_reason"] | null
          ended_at?: string | null
          id?: string
          last_ping_at?: string | null
          max_duration_minutes?: number
          mode: Database["public"]["Enums"]["tracking_mode"]
          project_id: string
          shipment_id: string
          started_at?: string
        }
        Update: {
          arrived_at?: string | null
          checkin_interval_minutes?: number | null
          created_at?: string
          delivered_at?: string | null
          device_token?: string
          driver_id?: string
          end_reason?: Database["public"]["Enums"]["trip_end_reason"] | null
          ended_at?: string | null
          id?: string
          last_ping_at?: string | null
          max_duration_minutes?: number
          mode?: Database["public"]["Enums"]["tracking_mode"]
          project_id?: string
          shipment_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_contents: {
        Row: {
          confirmed_by: string | null
          created_at: string
          description: string
          id: string
          piece_mark: string | null
          po_line_id: string | null
          provenance: Database["public"]["Enums"]["content_provenance"]
          qty: number
          release_line_id: string | null
          search: unknown
          unit_id: string
          uom: string
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          description: string
          id?: string
          piece_mark?: string | null
          po_line_id?: string | null
          provenance?: Database["public"]["Enums"]["content_provenance"]
          qty?: number
          release_line_id?: string | null
          search?: unknown
          unit_id: string
          uom?: string
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          description?: string
          id?: string
          piece_mark?: string | null
          po_line_id?: string | null
          provenance?: Database["public"]["Enums"]["content_provenance"]
          qty?: number
          release_line_id?: string | null
          search?: unknown
          unit_id?: string
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_contents_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_contents_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_contents_release_line_id_fkey"
            columns: ["release_line_id"]
            isOneToOne: false
            referencedRelation: "release_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_contents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "handling_units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_projects: {
        Row: {
          entered_at: string
          from_event_id: string | null
          left_at: string | null
          project_id: string
          unit_id: string
        }
        Insert: {
          entered_at?: string
          from_event_id?: string | null
          left_at?: string | null
          project_id: string
          unit_id: string
        }
        Update: {
          entered_at?: string
          from_event_id?: string | null
          left_at?: string | null
          project_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_projects_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "handling_units"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          center: unknown
          created_at: string
          id: string
          kind: string
          name: string
          polygon: unknown
          project_id: string
          radius_m: number
        }
        Insert: {
          center: unknown
          created_at?: string
          id?: string
          kind?: string
          name: string
          polygon?: unknown
          project_id: string
          radius_m?: number
        }
        Update: {
          center?: unknown
          created_at?: string
          id?: string
          kind?: string
          name?: string
          polygon?: unknown
          project_id?: string
          radius_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "zones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: {
          approach_rings: Json
          archived_at: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          owner_org_id: string
          site_point: unknown
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auth_org_id: { Args: never; Returns: string }
      create_organization: {
        Args: {
          p_jurisdiction: string
          p_kind: Database["public"]["Enums"]["org_kind"]
          p_name: string
        }
        Returns: {
          claimed_at: string | null
          contact_email: string | null
          created_at: string
          dpa_signed_at: string | null
          hosting_region: string
          id: string
          is_placeholder: boolean
          jurisdiction: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          retention_days_events: number | null
          retention_days_pings: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_project: {
        Args: {
          p_code: string
          p_lat: number
          p_lng: number
          p_name: string
          p_timezone: string
        }
        Returns: {
          approach_rings: Json
          archived_at: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          owner_org_id: string
          site_point: unknown
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_notice_version_id: { Args: { org: string }; Returns: string }
      derive_status: {
        Args: { sid: string; st: Database["public"]["Enums"]["subject_type"] }
        Returns: {
          event_id: string
          occurred_at: string
          status: Database["public"]["Enums"]["custody_status"]
          zone_id: string
        }[]
      }
      end_trip: {
        Args: {
          p_event_id: string
          p_reason: Database["public"]["Enums"]["trip_end_reason"]
          p_trip_id: string
        }
        Returns: undefined
      }
      expire_overdue_trips: { Args: never; Returns: number }
      find_material: {
        Args: { p_limit?: number; p_project_id: string; p_query: string }
        Returns: {
          description: string
          location_name: string
          po_number: string
          rank: number
          release_number: string
          short_code: string
          status: Database["public"]["Enums"]["custody_status"]
          unit_id: string
          zone_name: string
        }[]
      }
      generate_short_code: { Args: never; Returns: string }
      get_live_positions: {
        Args: {
          p_project_id: string
          p_purpose: Database["public"]["Enums"]["access_purpose"]
        }
        Returns: {
          lat: number
          lng: number
          recorded_at: string
          shipment_id: string
          trip_id: string
        }[]
      }
      get_trip_pings: {
        Args: {
          p_purpose: Database["public"]["Enums"]["access_purpose"]
          p_trip_id: string
        }
        Returns: {
          lat: number
          lng: number
          precision_m: number
          recorded_at: string
        }[]
      }
      has_project_role: {
        Args: {
          p: string
          roles: Database["public"]["Enums"]["project_role"][]
        }
        Returns: boolean
      }
      ingest_pings: {
        Args: { p_device_token: string; p_pings: Json; p_trip_id: string }
        Returns: number
      }
      is_org_admin: { Args: { org: string }; Returns: boolean }
      is_project_member: { Args: { p: string }; Returns: boolean }
      my_access_log: {
        Args: never
        Returns: {
          id: number
          project_id: string
          purpose: Database["public"]["Enums"]["access_purpose"]
          subject: Database["public"]["Enums"]["access_subject"]
          subject_id: string
          viewed_at: string
          viewer_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "access_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      project_location_names: {
        Args: { p_project_id: string }
        Returns: {
          location_name: string
          unit_count: number
        }[]
      }
      project_role_of: {
        Args: { p: string }
        Returns: Database["public"]["Enums"]["project_role"]
      }
      purge_expired_pings: { Args: never; Returns: number }
      random_token: { Args: { n_bytes?: number }; Returns: string }
      resolve_token: { Args: { p_token: string }; Returns: Json }
      role_may_record: {
        Args: { et: Database["public"]["Enums"]["event_type"]; p: string }
        Returns: boolean
      }
      shipment_project: { Args: { s: string }; Returns: string }
      skew_window: { Args: never; Returns: string }
      start_trip: {
        Args: {
          p_event_id: string
          p_mode: Database["public"]["Enums"]["tracking_mode"]
          p_shipment_id: string
        }
        Returns: {
          arrived_at: string | null
          checkin_interval_minutes: number | null
          created_at: string
          delivered_at: string | null
          device_token: string
          driver_id: string
          end_reason: Database["public"]["Enums"]["trip_end_reason"] | null
          ended_at: string | null
          id: string
          last_ping_at: string | null
          max_duration_minutes: number
          mode: Database["public"]["Enums"]["tracking_mode"]
          project_id: string
          shipment_id: string
          started_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unit_visible: { Args: { u: string }; Returns: boolean }
    }
    Enums: {
      access_purpose:
        | "shipment_status"
        | "proof_of_delivery"
        | "exception_investigation"
        | "worker_request"
        | "safety"
        | "support"
      access_subject: "trip_pings" | "worker_history" | "live_position"
      consent_kind: "location_tracking"
      content_provenance: "structured" | "manual" | "extracted"
      custody_status:
        | "released"
        | "ready_for_pickup"
        | "picked_up"
        | "in_transit"
        | "arrived"
        | "delivered"
        | "received"
        | "in_storage"
        | "issued"
        | "installed"
        | "exception"
      document_kind:
        | "packing_list"
        | "bill_of_lading"
        | "mtr"
        | "drawing"
        | "customs"
        | "other"
      event_source:
        | "qr_scan"
        | "manual_ping"
        | "auto_ping"
        | "geofence"
        | "dashboard"
        | "system"
      event_type:
        | "released"
        | "assigned_to_shipment"
        | "picked_up"
        | "tracking_started"
        | "tracking_paused"
        | "tracking_resumed"
        | "permission_lost"
        | "consent_revoked"
        | "tracking_ended"
        | "ping"
        | "approach_ring_crossed"
        | "border_crossed"
        | "arrived"
        | "delivered"
        | "received"
        | "inspected"
        | "stored"
        | "moved"
        | "split"
        | "transferred_to_project"
        | "issued"
        | "installed"
        | "exception"
        | "void"
        | "correction"
        | "safety_checkin"
      evidence_kind: "photo" | "signature" | "form" | "document"
      extraction_status: "queued" | "running" | "done" | "failed"
      incident_status: "open" | "assessed" | "reported" | "closed"
      org_kind: "contractor" | "owner" | "supplier" | "carrier" | "other"
      org_role: "admin" | "member"
      project_role: "coordinator" | "shipper" | "driver" | "handler" | "viewer"
      subject_type: "shipment" | "handling_unit"
      tracking_mode: "manual" | "auto"
      trip_end_reason:
        | "delivered"
        | "cancelled"
        | "max_duration"
        | "stationary"
        | "permission_lost"
        | "consent_revoked"
        | "driver_ended"
      update_kind:
        | "delay"
        | "eta_change"
        | "departed"
        | "at_gate"
        | "offloading"
        | "released_driver"
        | "issue"
        | "resolved"
        | "note"
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
    Enums: {
      access_purpose: [
        "shipment_status",
        "proof_of_delivery",
        "exception_investigation",
        "worker_request",
        "safety",
        "support",
      ],
      access_subject: ["trip_pings", "worker_history", "live_position"],
      consent_kind: ["location_tracking"],
      content_provenance: ["structured", "manual", "extracted"],
      custody_status: [
        "released",
        "ready_for_pickup",
        "picked_up",
        "in_transit",
        "arrived",
        "delivered",
        "received",
        "in_storage",
        "issued",
        "installed",
        "exception",
      ],
      document_kind: [
        "packing_list",
        "bill_of_lading",
        "mtr",
        "drawing",
        "customs",
        "other",
      ],
      event_source: [
        "qr_scan",
        "manual_ping",
        "auto_ping",
        "geofence",
        "dashboard",
        "system",
      ],
      event_type: [
        "released",
        "assigned_to_shipment",
        "picked_up",
        "tracking_started",
        "tracking_paused",
        "tracking_resumed",
        "permission_lost",
        "consent_revoked",
        "tracking_ended",
        "ping",
        "approach_ring_crossed",
        "border_crossed",
        "arrived",
        "delivered",
        "received",
        "inspected",
        "stored",
        "moved",
        "split",
        "transferred_to_project",
        "issued",
        "installed",
        "exception",
        "void",
        "correction",
        "safety_checkin",
      ],
      evidence_kind: ["photo", "signature", "form", "document"],
      extraction_status: ["queued", "running", "done", "failed"],
      incident_status: ["open", "assessed", "reported", "closed"],
      org_kind: ["contractor", "owner", "supplier", "carrier", "other"],
      org_role: ["admin", "member"],
      project_role: ["coordinator", "shipper", "driver", "handler", "viewer"],
      subject_type: ["shipment", "handling_unit"],
      tracking_mode: ["manual", "auto"],
      trip_end_reason: [
        "delivered",
        "cancelled",
        "max_duration",
        "stationary",
        "permission_lost",
        "consent_revoked",
        "driver_ended",
      ],
      update_kind: [
        "delay",
        "eta_change",
        "departed",
        "at_gate",
        "offloading",
        "released_driver",
        "issue",
        "resolved",
        "note",
      ],
    },
  },
} as const
