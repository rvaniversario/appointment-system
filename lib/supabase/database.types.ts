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

export type FirmRole = "attorney" | "partner" | "admin";
export type FirmStatus = "pending" | "active" | "suspended";
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
      firms: Table<
        {
          id: Uuid;
          slug: string;
          name: string;
          status: FirmStatus;
          logo_path: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          agreement_text: string | null;
          cancellation_cutoff_hours: number;
          created_at: Ts;
          updated_at: Ts;
        },
        "slug" | "name"
      >;
      firm_memberships: Table<
        { profile_id: Uuid; firm_id: Uuid; role: FirmRole; created_at: Ts },
        "profile_id" | "firm_id" | "role"
      >;
      platform_admins: Table<{ profile_id: Uuid; created_at: Ts }, "profile_id">;
      offices: Table<
        { id: Uuid; firm_id: Uuid; name: string; address: string; is_remote: boolean; created_at: Ts },
        "firm_id" | "name"
      >;
      attorneys: Table<
        {
          id: Uuid;
          firm_id: Uuid;
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
        "firm_id" | "slug" | "full_name"
      >;
      consult_types: Table<
        {
          id: Uuid;
          firm_id: Uuid;
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
        "firm_id" | "slug" | "label" | "mode" | "duration_minutes"
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
          firm_id: Uuid;
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
          booking_token_hash: string | null;
          confirmed_at: Ts | null;
          created_at: Ts;
          updated_at: Ts;
        },
        "firm_id" | "attorney_id" | "consult_type_id" | "starts_at" | "ends_at"
      >;
      intakes: Table<
        {
          id: Uuid;
          firm_id: Uuid;
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
        | "firm_id"
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
        { id: Uuid; firm_id: Uuid; name: string; matter: string; attorney_id: Uuid | null; created_at: Ts },
        "firm_id" | "name" | "matter"
      >;
      conflict_hits: Table<
        {
          id: Uuid;
          firm_id: Uuid;
          appointment_id: Uuid;
          conflict_party_id: Uuid;
          matched_name: string;
          similarity: number;
          created_at: Ts;
        },
        "firm_id" | "appointment_id" | "conflict_party_id" | "matched_name" | "similarity"
      >;
      documents: Table<
        {
          id: Uuid;
          firm_id: Uuid;
          owner_id: Uuid;
          appointment_id: Uuid | null;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: Uuid | null;
          created_at: Ts;
        },
        "firm_id" | "owner_id" | "storage_path" | "file_name" | "mime_type" | "size_bytes"
      >;
      agreements: Table<
        {
          id: Uuid;
          firm_id: Uuid;
          appointment_id: Uuid;
          client_id: Uuid | null;
          version: string;
          body_sha256: string;
          signature_name: string;
          signed_at: Ts;
          ip_address: string | null;
          user_agent: string | null;
        },
        "firm_id" | "appointment_id" | "version" | "body_sha256" | "signature_name"
      >;
      invoices: Table<
        {
          id: Uuid;
          firm_id: Uuid;
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
        "firm_id" | "client_id" | "description" | "amount_centavos"
      >;
      payments: Table<
        {
          id: Uuid;
          firm_id: Uuid;
          client_id: Uuid | null;
          appointment_id: Uuid | null;
          invoice_id: Uuid | null;
          provider: string;
          provider_checkout_id: string | null;
          provider_payment_id: string | null;
          amount_centavos: number;
          currency: string;
          status: PaymentStatus;
          account_id: string | null;
          refunded_centavos: number;
          provider_refund_id: string | null;
          refunded_at: Ts | null;
          failure_reason: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        "firm_id" | "amount_centavos"
      >;
      firm_payment_accounts: Table<
        {
          firm_id: Uuid;
          provider: string;
          account_id: string | null;
          invitation_id: string | null;
          status: "invited" | "active" | "disabled";
          livemode: boolean;
          webhook_id: string | null;
          webhook_secret: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        "firm_id" | "livemode"
      >;
      webhook_events: Table<
        { id: string; provider: string; account_id: string; type: string; payload: Json; received_at: Ts },
        "id" | "provider" | "type" | "payload"
      >;
      message_threads: Table<
        { id: Uuid; firm_id: Uuid; client_id: Uuid; attorney_id: Uuid; created_at: Ts },
        "firm_id" | "client_id" | "attorney_id"
      >;
      messages: Table<
        { id: Uuid; thread_id: Uuid; sender_id: Uuid; body: string; read_at: Ts | null; created_at: Ts },
        "thread_id" | "sender_id" | "body"
      >;
      notification_log: Table<
        {
          id: Uuid;
          firm_id: Uuid;
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
        "firm_id" | "channel" | "template" | "recipient"
      >;
      audit_log: Table<
        {
          id: number;
          firm_id: Uuid | null;
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
      current_firm_id: { Args: Record<string, never>; Returns: Uuid };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_manager: { Args: Record<string, never>; Returns: boolean };
      current_attorney_id: { Args: Record<string, never>; Returns: Uuid };
      firm_can_accept_bookings: { Args: { p_firm: Uuid }; Returns: boolean };
      run_conflict_check: { Args: { p_appointment: Uuid }; Returns: number };
      firm_accepts_payments: { Args: { p_firm: Uuid }; Returns: boolean };
      mark_thread_read: { Args: { p_thread: Uuid }; Returns: undefined };
      replace_weekly_hours: { Args: { p_attorney: Uuid; p_hours: Json }; Returns: undefined };
      search_conflict_parties: {
        Args: { p_query: string };
        Returns: { id: Uuid; name: string; matter: string; attorney_id: Uuid | null; similarity: number }[];
      };
    };
    Enums: {
      firm_role: FirmRole;
      firm_status: FirmStatus;
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
