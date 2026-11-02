/**
 * Database types. Hand-written to match supabase/migrations until a Supabase project is
 * linked; then regenerate with `npm run db:types` (overwrites this file).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type Ts = string;
type Uuid = string;

export type UserRole = "client" | "attorney" | "partner" | "admin";
export type ConsultMode = "phone" | "video" | "in_person";
export type AppointmentStatus = "held" | "pending_payment" | "confirmed" | "canceled" | "completed" | "no_show";
export type ReviewStatus = "pending" | "approved" | "declined";
export type Urgency = "standard" | "urgent";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "expired";
export type InvoiceStatus = "due" | "paid" | "void" | "refunded";
export type NotificationChannel = "email" | "sms";
export type NotificationStatus = "queued" | "sent" | "failed";

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: Uuid;
          role: UserRole;
          email: string;
          first_name: string;
          middle_name: string;
          last_name: string;
          mobile: string | null;
          date_of_birth: string | null;
          photo_path: string | null;
          sms_opt_in: boolean;
          privacy_consent_at: Ts | null;
          created_at: Ts;
          updated_at: Ts;
        },
        "id" | "email"
      >;
      offices: Table<
        { id: Uuid; name: string; address: string; is_remote: boolean; created_at: Ts },
        "name"
      >;
      attorneys: Table<
        {
          id: Uuid;
          profile_id: Uuid | null;
          slug: string;
          full_name: string;
          ibp_roll_no: string | null;
          admitted_year: number | null;
          practice_areas: string[];
          languages: string[];
          office_id: Uuid | null;
          bio: string;
          photo_path: string | null;
          meeting_url: string | null;
          is_active: boolean;
          created_at: Ts;
          updated_at: Ts;
        },
        "slug" | "full_name"
      >;
      consult_types: Table<
        {
          id: Uuid;
          slug: string;
          label: string;
          description: string;
          mode: ConsultMode;
          duration_minutes: number;
          price_centavos: number;
          is_active: boolean;
          sort_order: number;
          created_at: Ts;
        },
        "slug" | "label" | "mode" | "duration_minutes"
      >;
      availability_rules: Table<
        { id: Uuid; attorney_id: Uuid; weekday: number; start_time: string; end_time: string },
        "attorney_id" | "weekday" | "start_time" | "end_time"
      >;
      availability_exceptions: Table<
        { id: Uuid; attorney_id: Uuid; starts_at: Ts; ends_at: Ts; reason: string },
        "attorney_id" | "starts_at" | "ends_at"
      >;
      appointments: Table<
        {
          id: Uuid;
          attorney_id: Uuid;
          client_id: Uuid | null;
          consult_type_id: Uuid;
          starts_at: Ts;
          ends_at: Ts;
          during: string;
          status: AppointmentStatus;
          hold_expires_at: Ts | null;
          review_status: ReviewStatus;
          meeting_url: string | null;
          price_centavos: number;
          canceled_at: Ts | null;
          cancel_reason: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        "attorney_id" | "consult_type_id" | "starts_at" | "ends_at"
      >;
      intakes: Table<
        {
          id: Uuid;
          appointment_id: Uuid;
          client_id: Uuid | null;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          case_type: string;
          urgency: Urgency;
          details: string;
          opposing_party: string;
          privacy_consent_at: Ts;
          sms_opt_in: boolean;
          created_at: Ts;
        },
        | "appointment_id"
        | "first_name"
        | "last_name"
        | "email"
        | "phone"
        | "case_type"
        | "details"
        | "privacy_consent_at"
      >;
      conflict_parties: Table<
        { id: Uuid; name: string; matter: string; attorney_id: Uuid | null; created_at: Ts },
        "name" | "matter"
      >;
      conflict_hits: Table<
        {
          id: Uuid;
          appointment_id: Uuid;
          conflict_party_id: Uuid;
          matched_name: string;
          similarity: number;
          created_at: Ts;
        },
        "appointment_id" | "conflict_party_id" | "matched_name" | "similarity"
      >;
      documents: Table<
        {
          id: Uuid;
          owner_id: Uuid;
          appointment_id: Uuid | null;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: Uuid | null;
          created_at: Ts;
        },
        "owner_id" | "storage_path" | "file_name" | "mime_type" | "size_bytes"
      >;
      agreements: Table<
        {
          id: Uuid;
          appointment_id: Uuid;
          client_id: Uuid | null;
          version: string;
          body_sha256: string;
          signature_name: string;
          signed_at: Ts;
          ip_address: string | null;
          user_agent: string | null;
        },
        "appointment_id" | "version" | "body_sha256" | "signature_name"
      >;
      invoices: Table<
        {
          id: Uuid;
          client_id: Uuid;
          appointment_id: Uuid | null;
          description: string;
          amount_centavos: number;
          currency: string;
          status: InvoiceStatus;
          due_date: string | null;
          paid_at: Ts | null;
          created_at: Ts;
          updated_at: Ts;
        },
        "client_id" | "description" | "amount_centavos"
      >;
      payments: Table<
        {
          id: Uuid;
          client_id: Uuid | null;
          appointment_id: Uuid | null;
          invoice_id: Uuid | null;
          provider: string;
          provider_checkout_id: string | null;
          provider_payment_id: string | null;
          amount_centavos: number;
          currency: string;
          status: PaymentStatus;
          created_at: Ts;
          updated_at: Ts;
        },
        "amount_centavos"
      >;
      webhook_events: Table<
        { id: string; provider: string; type: string; payload: Json; received_at: Ts },
        "id" | "provider" | "type" | "payload"
      >;
      message_threads: Table<
        { id: Uuid; client_id: Uuid; attorney_id: Uuid; created_at: Ts },
        "client_id" | "attorney_id"
      >;
      messages: Table<
        { id: Uuid; thread_id: Uuid; sender_id: Uuid; body: string; read_at: Ts | null; created_at: Ts },
        "thread_id" | "sender_id" | "body"
      >;
      notification_log: Table<
        {
          id: Uuid;
          channel: NotificationChannel;
          template: string;
          recipient: string;
          appointment_id: Uuid | null;
          status: NotificationStatus;
          provider_message_id: string | null;
          error: string | null;
          attempts: number;
          created_at: Ts;
          sent_at: Ts | null;
        },
        "channel" | "template" | "recipient"
      >;
      audit_log: Table<
        {
          id: number;
          actor_id: Uuid | null;
          action: string;
          entity: string;
          entity_id: string | null;
          details: Json;
          created_at: Ts;
        },
        "action" | "entity"
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: UserRole };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_manager: { Args: Record<string, never>; Returns: boolean };
      current_attorney_id: { Args: Record<string, never>; Returns: Uuid };
    };
    Enums: {
      user_role: UserRole;
      consult_mode: ConsultMode;
      appointment_status: AppointmentStatus;
      review_status: ReviewStatus;
      urgency: Urgency;
      payment_status: PaymentStatus;
      invoice_status: InvoiceStatus;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
