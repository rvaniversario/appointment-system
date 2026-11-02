-- Core schema for the consultation booking system.
-- Every table has Row Level Security enabled; RLS is the authorization layer.
-- Money is stored as integer centavos (PHP). Timestamps are timestamptz (UTC);
-- the firm's display timezone is Asia/Manila.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'attorney', 'partner', 'admin');
create type public.consult_mode as enum ('phone', 'video', 'in_person');
create type public.appointment_status as enum
  ('held', 'pending_payment', 'confirmed', 'canceled', 'completed', 'no_show');
create type public.review_status as enum ('pending', 'approved', 'declined');
create type public.urgency as enum ('standard', 'urgent');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'expired');
create type public.invoice_status as enum ('due', 'paid', 'void', 'refunded');
create type public.notification_channel as enum ('email', 'sms');
create type public.notification_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  email text not null,
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  mobile text,                       -- E.164-ish PH format: 639XXXXXXXXX
  date_of_birth date,
  photo_path text,                   -- object path in the "avatars" bucket
  sms_opt_in boolean not null default false,
  privacy_consent_at timestamptz,    -- RA 10173 consent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_mobile_format check (mobile is null or mobile ~ '^639[0-9]{9}$')
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile for every new auth user; keep email in sync.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users created before this migration ran get a profile too.
insert into public.profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies don't recurse into RLS)
-- Staff privileges additionally require an MFA-verified session (aal2).
-- ---------------------------------------------------------------------------
create function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_mfa_verified() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_mfa_verified()
     and coalesce(public.current_user_role() in ('attorney', 'partner', 'admin'), false);
$$;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_mfa_verified()
     and coalesce(public.current_user_role() in ('partner', 'admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- Directory: offices, attorneys, consultation types, availability
-- ---------------------------------------------------------------------------
create table public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null default '',
  is_remote boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.attorneys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  full_name text not null,
  ibp_roll_no text,
  admitted_year smallint check (admitted_year between 1900 and 2100),
  practice_areas text[] not null default '{}',
  languages text[] not null default '{}',
  office_id uuid references public.offices (id) on delete set null,
  bio text not null default '',
  photo_path text,                   -- object path in the public "attorney-photos" bucket
  meeting_url text,                  -- default Zoom/Meet link
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attorneys_practice_areas_idx on public.attorneys using gin (practice_areas);
create index attorneys_languages_idx on public.attorneys using gin (languages);
create trigger attorneys_updated_at before update on public.attorneys
  for each row execute function public.set_updated_at();

create function public.current_attorney_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.attorneys where profile_id = auth.uid() and public.is_staff();
$$;

create table public.consult_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text not null default '',
  mode public.consult_mode not null,
  duration_minutes smallint not null check (duration_minutes between 5 and 480),
  price_centavos integer not null default 0 check (price_centavos >= 0),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Weekly recurring hours, interpreted in Asia/Manila local time.
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  attorney_id uuid not null references public.attorneys (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index availability_rules_attorney_idx on public.availability_rules (attorney_id, weekday);

-- Leave, holidays, blocked time.
create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  attorney_id uuid not null references public.attorneys (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  check (ends_at > starts_at)
);
create index availability_exceptions_attorney_idx on public.availability_exceptions (attorney_id, starts_at);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  attorney_id uuid not null references public.attorneys (id),
  client_id uuid references public.profiles (id) on delete set null,
  consult_type_id uuid not null references public.consult_types (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status public.appointment_status not null default 'held',
  hold_expires_at timestamptz,
  review_status public.review_status not null default 'pending',
  meeting_url text,
  price_centavos integer not null default 0 check (price_centavos >= 0),
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- No two active appointments for the same attorney may overlap.
  constraint appointments_no_overlap exclude using gist (
    attorney_id with =,
    during with &&
  ) where (status in ('held', 'pending_payment', 'confirmed'))
);
create index appointments_client_idx on public.appointments (client_id, starts_at);
create index appointments_attorney_idx on public.appointments (attorney_id, starts_at);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- Does the current staff attorney have (or had) an appointment with this client?
create function public.attorney_has_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.client_id = p_client and a.attorney_id = public.current_attorney_id()
  );
$$;

-- Can the current user see this appointment's confidential details?
create function public.can_access_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_appointment
      and (a.client_id = auth.uid()
           or public.is_manager()
           or a.attorney_id = public.current_attorney_id())
  );
$$;

create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  case_type text not null,
  urgency public.urgency not null default 'standard',
  details text not null,
  opposing_party text not null default '',
  privacy_consent_at timestamptz not null,
  sms_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

-- Known parties for conflict-of-interest checks. Staff only.
create table public.conflict_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  matter text not null,
  attorney_id uuid references public.attorneys (id) on delete set null,
  created_at timestamptz not null default now()
);
create index conflict_parties_name_trgm_idx
  on public.conflict_parties using gin (name extensions.gin_trgm_ops);

-- Conflict check results per appointment. Kept off `appointments` so clients never see them.
create table public.conflict_hits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  conflict_party_id uuid not null references public.conflict_parties (id) on delete cascade,
  matched_name text not null,
  similarity real not null,
  created_at timestamptz not null default now(),
  unique (appointment_id, conflict_party_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  storage_path text not null unique,  -- "client-documents" bucket: {owner_id}/{uuid}-{file}
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index documents_owner_idx on public.documents (owner_id);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  version text not null,
  body_sha256 text not null,
  signature_name text not null,
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text
);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  appointment_id uuid references public.appointments (id) on delete set null,
  description text not null,
  amount_centavos integer not null check (amount_centavos >= 0),
  currency text not null default 'PHP',
  status public.invoice_status not null default 'due',
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_client_idx on public.invoices (client_id);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  provider text not null default 'paymongo',
  provider_checkout_id text unique,
  provider_payment_id text unique,
  amount_centavos integer not null check (amount_centavos >= 0),
  currency text not null default 'PHP',
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Idempotency ledger for provider webhooks. Service role only.
create table public.webhook_events (
  id text primary key,               -- provider event id
  provider text not null,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  attorney_id uuid not null references public.attorneys (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, attorney_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

create function public.can_access_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread
      and (t.client_id = auth.uid()
           or t.attorney_id = public.current_attorney_id()
           or public.is_manager())
  );
$$;

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  channel public.notification_channel not null,
  template text not null,
  recipient text not null,
  appointment_id uuid references public.appointments (id) on delete set null,
  status public.notification_status not null default 'queued',
  provider_message_id text,
  error text,
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- Prevents duplicate reminders, e.g. ('sms', 'reminder_24h', appointment)
  unique (channel, template, appointment_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.offices enable row level security;
alter table public.attorneys enable row level security;
alter table public.consult_types enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.appointments enable row level security;
alter table public.intakes enable row level security;
alter table public.conflict_parties enable row level security;
alter table public.conflict_hits enable row level security;
alter table public.documents enable row level security;
alter table public.agreements enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.notification_log enable row level security;
alter table public.audit_log enable row level security;

-- profiles: users read/update themselves; staff read all. Role is NOT user-editable
-- (column-level grants below); only the service role (admin API) changes roles.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, middle_name, last_name, mobile, date_of_birth, photo_path, sms_opt_in)
  on public.profiles to authenticated;

-- Public directory data.
create policy offices_read on public.offices for select to anon, authenticated using (true);
create policy offices_write on public.offices for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy attorneys_read on public.attorneys for select to anon, authenticated
  using (is_active or public.is_staff());
create policy attorneys_manage on public.attorneys for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
-- Attorneys edit their own bio/meeting link through a narrow RPC (Phase 4), not a row policy,
-- so they can never change slug, is_active or profile_id.

create policy consult_types_read on public.consult_types for select to anon, authenticated
  using (is_active or public.is_staff());
create policy consult_types_write on public.consult_types for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy availability_rules_read on public.availability_rules for select to anon, authenticated
  using (true);
create policy availability_rules_write on public.availability_rules for all to authenticated
  using (public.is_manager() or attorney_id = public.current_attorney_id())
  with check (public.is_manager() or attorney_id = public.current_attorney_id());

-- Exception reasons may be private (e.g. leave); public slot search goes through an RPC.
create policy availability_exceptions_staff on public.availability_exceptions for all to authenticated
  using (public.is_manager() or attorney_id = public.current_attorney_id())
  with check (public.is_manager() or attorney_id = public.current_attorney_id());

-- appointments: client sees own; assigned attorney and managers see theirs/all.
-- Creation/state changes happen through server code (RPCs / service role), not direct inserts.
create policy appointments_select on public.appointments for select to authenticated
  using (client_id = (select auth.uid()) or public.is_manager()
         or attorney_id = public.current_attorney_id());
create policy appointments_staff_update on public.appointments for update to authenticated
  using (public.is_manager() or attorney_id = public.current_attorney_id())
  with check (public.is_manager() or attorney_id = public.current_attorney_id());

create policy intakes_select on public.intakes for select to authenticated
  using (public.can_access_appointment(appointment_id));

create policy conflict_parties_staff_read on public.conflict_parties for select to authenticated
  using (public.is_staff());
create policy conflict_parties_manage on public.conflict_parties for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy conflict_hits_staff_read on public.conflict_hits for select to authenticated
  using (public.is_manager()
         or exists (select 1 from public.appointments a
                    where a.id = appointment_id and a.attorney_id = public.current_attorney_id()));

create policy documents_select on public.documents for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_manager() or public.attorney_has_client(owner_id));
create policy documents_insert_own on public.documents for insert to authenticated
  with check (owner_id = (select auth.uid()) and uploaded_by = (select auth.uid()));
create policy documents_delete_own on public.documents for delete to authenticated
  using (owner_id = (select auth.uid()) and uploaded_by = (select auth.uid()));

create policy agreements_select on public.agreements for select to authenticated
  using (public.can_access_appointment(appointment_id));

-- Billing is visible to the client it belongs to and to partners/admins only.
create policy invoices_select on public.invoices for select to authenticated
  using (client_id = (select auth.uid()) or public.is_manager());
create policy payments_select on public.payments for select to authenticated
  using (client_id = (select auth.uid()) or public.is_manager());

-- webhook_events: no policies => service role only.

create policy threads_select on public.message_threads for select to authenticated
  using (public.can_access_thread(id));
create policy messages_select on public.messages for select to authenticated
  using (public.can_access_thread(thread_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_access_thread(thread_id));

create policy notification_log_manager_read on public.notification_log for select to authenticated
  using (public.is_manager());
create policy audit_log_manager_read on public.audit_log for select to authenticated
  using (public.is_manager());

-- Helper functions. The role checks are referenced by anon-visible policies (directory
-- tables), so anon may execute them; they return false/null without a signed-in user.
revoke execute on function public.current_user_role(), public.is_staff(), public.is_manager(),
  public.current_attorney_id(), public.attorney_has_client(uuid),
  public.can_access_appointment(uuid), public.can_access_thread(uuid)
  from public;
grant execute on function public.current_user_role(), public.is_staff(), public.is_manager(),
  public.current_attorney_id()
  to anon, authenticated;
grant execute on function public.attorney_has_client(uuid),
  public.can_access_appointment(uuid), public.can_access_thread(uuid)
  to authenticated;
revoke execute on function public.handle_new_user(), public.handle_user_email_change()
  from public, anon, authenticated;
