-- Multi-tenancy: every firm's data is isolated from every other firm's.
--
-- A firm is the customer; a solo attorney is a firm of one. Being staff now means having a
-- row in firm_memberships, so profiles.role goes away. Staff belong to exactly one firm.
-- Clients are not members: one login can have appointments at several firms, and each firm
-- sees only its own dealings with that client.
--
-- Composite foreign keys such as (firm_id, attorney_id) make the database reject any row
-- that mixes two firms, independently of RLS and of the service role.

-- ---------------------------------------------------------------------------
-- Storage paths change below, and objects can't be moved from SQL. No code has uploaded to
-- these buckets yet, so stop rather than strand files if that has changed.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from storage.objects where bucket_id in ('client-documents', 'attorney-photos'))
     or exists (select 1 from public.documents) then
    raise exception 'Existing documents or attorney photos must be moved to firm-scoped paths first.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Firms and memberships
-- ---------------------------------------------------------------------------
create type public.firm_role as enum ('attorney', 'partner', 'admin');
create type public.firm_status as enum ('pending', 'active', 'suspended');

create table public.firms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 200),
  status public.firm_status not null default 'pending',  -- only 'active' firms are public
  logo_path text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger firms_updated_at before update on public.firms
  for each row execute function public.set_updated_at();

create table public.firm_memberships (
  profile_id uuid primary key references public.profiles (id) on delete cascade,  -- one firm per person
  firm_id uuid not null references public.firms (id),
  role public.firm_role not null,
  created_at timestamptz not null default now(),
  unique (firm_id, profile_id)
);

-- Our own operators. Grants no access to client data: no policy below refers to this table.
create table public.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- firm_id on tenant tables. availability_* and messages inherit it through their parent.
-- ---------------------------------------------------------------------------
alter table public.offices add column firm_id uuid references public.firms (id);
alter table public.attorneys add column firm_id uuid references public.firms (id);
alter table public.consult_types add column firm_id uuid references public.firms (id);
alter table public.appointments add column firm_id uuid references public.firms (id);
alter table public.intakes add column firm_id uuid references public.firms (id);
alter table public.conflict_parties add column firm_id uuid references public.firms (id);
alter table public.conflict_hits add column firm_id uuid references public.firms (id);
alter table public.documents add column firm_id uuid references public.firms (id);
alter table public.agreements add column firm_id uuid references public.firms (id);
alter table public.invoices add column firm_id uuid references public.firms (id);
alter table public.payments add column firm_id uuid references public.firms (id);
alter table public.message_threads add column firm_id uuid references public.firms (id);
alter table public.notification_log add column firm_id uuid references public.firms (id);
-- Null for platform-level events.
alter table public.audit_log add column firm_id uuid references public.firms (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Backfill. Only a database that already holds data gets a firm, so a fresh production
-- database starts with none. Rename this firm afterwards if it's kept.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tables constant text[] := array[
    'offices', 'attorneys', 'consult_types', 'appointments', 'intakes', 'conflict_parties',
    'conflict_hits', 'documents', 'agreements', 'invoices', 'payments', 'message_threads',
    'notification_log'];
  v_table text;
  v_has_rows boolean;
  v_needs_firm boolean := exists (select 1 from public.profiles where role <> 'client');
  v_firm uuid;
begin
  foreach v_table in array v_tables loop
    execute format('select exists (select 1 from public.%I)', v_table) into v_has_rows;
    v_needs_firm := v_needs_firm or v_has_rows;
  end loop;

  if not v_needs_firm then
    return;
  end if;

  insert into public.firms (slug, name, status)
  values ('default-firm', 'Default firm', 'active')
  returning id into v_firm;

  foreach v_table in array v_tables || array['audit_log'] loop
    execute format('update public.%I set firm_id = $1', v_table) using v_firm;
  end loop;

  insert into public.firm_memberships (profile_id, firm_id, role)
  select id, v_firm, role::text::public.firm_role from public.profiles where role <> 'client';

  -- An attorney may only be linked to a member of their firm (constraint below).
  update public.attorneys a set profile_id = null
  where a.profile_id is not null
    and not exists (select 1 from public.firm_memberships m where m.profile_id = a.profile_id);
end;
$$;

alter table public.offices alter column firm_id set not null;
alter table public.attorneys alter column firm_id set not null;
alter table public.consult_types alter column firm_id set not null;
alter table public.appointments alter column firm_id set not null;
alter table public.intakes alter column firm_id set not null;
alter table public.conflict_parties alter column firm_id set not null;
alter table public.conflict_hits alter column firm_id set not null;
alter table public.documents alter column firm_id set not null;
alter table public.agreements alter column firm_id set not null;
alter table public.invoices alter column firm_id set not null;
alter table public.payments alter column firm_id set not null;
alter table public.message_threads alter column firm_id set not null;
alter table public.notification_log alter column firm_id set not null;

-- ---------------------------------------------------------------------------
-- Uniqueness per firm, and targets for the composite foreign keys
-- ---------------------------------------------------------------------------
alter table public.offices drop constraint offices_name_key,
  add constraint offices_firm_name_key unique (firm_id, name),
  add constraint offices_firm_id_id_key unique (firm_id, id);
alter table public.attorneys drop constraint attorneys_slug_key,
  add constraint attorneys_firm_slug_key unique (firm_id, slug),
  add constraint attorneys_firm_id_id_key unique (firm_id, id);
alter table public.consult_types drop constraint consult_types_slug_key,
  add constraint consult_types_firm_slug_key unique (firm_id, slug),
  add constraint consult_types_firm_id_id_key unique (firm_id, id);
alter table public.appointments add constraint appointments_firm_id_id_key unique (firm_id, id);
alter table public.conflict_parties add constraint conflict_parties_firm_id_id_key unique (firm_id, id);
alter table public.invoices add constraint invoices_firm_id_id_key unique (firm_id, id);

-- ---------------------------------------------------------------------------
-- Composite foreign keys replace the single-column ones. "set null (col)" keeps firm_id.
-- ---------------------------------------------------------------------------
alter table public.attorneys
  drop constraint attorneys_office_id_fkey,
  add constraint attorneys_office_fkey foreign key (firm_id, office_id)
    references public.offices (firm_id, id) on delete set null (office_id),
  add constraint attorneys_membership_fkey foreign key (firm_id, profile_id)
    references public.firm_memberships (firm_id, profile_id) on delete set null (profile_id);

alter table public.appointments
  drop constraint appointments_attorney_id_fkey,
  drop constraint appointments_consult_type_id_fkey,
  add constraint appointments_attorney_fkey foreign key (firm_id, attorney_id)
    references public.attorneys (firm_id, id),
  add constraint appointments_consult_type_fkey foreign key (firm_id, consult_type_id)
    references public.consult_types (firm_id, id);

alter table public.intakes
  drop constraint intakes_appointment_id_fkey,
  add constraint intakes_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete cascade;

alter table public.conflict_parties
  drop constraint conflict_parties_attorney_id_fkey,
  add constraint conflict_parties_attorney_fkey foreign key (firm_id, attorney_id)
    references public.attorneys (firm_id, id) on delete set null (attorney_id);

alter table public.conflict_hits
  drop constraint conflict_hits_appointment_id_fkey,
  drop constraint conflict_hits_conflict_party_id_fkey,
  add constraint conflict_hits_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete cascade,
  add constraint conflict_hits_party_fkey foreign key (firm_id, conflict_party_id)
    references public.conflict_parties (firm_id, id) on delete cascade;

alter table public.documents
  drop constraint documents_appointment_id_fkey,
  add constraint documents_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete set null (appointment_id),
  add constraint documents_storage_path_format
    check (storage_path like firm_id::text || '/' || owner_id::text || '/%');

alter table public.agreements
  drop constraint agreements_appointment_id_fkey,
  add constraint agreements_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete cascade;

alter table public.invoices
  drop constraint invoices_appointment_id_fkey,
  add constraint invoices_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete set null (appointment_id);

alter table public.payments
  drop constraint payments_appointment_id_fkey,
  drop constraint payments_invoice_id_fkey,
  add constraint payments_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete set null (appointment_id),
  add constraint payments_invoice_fkey foreign key (firm_id, invoice_id)
    references public.invoices (firm_id, id) on delete set null (invoice_id);

alter table public.message_threads
  drop constraint message_threads_attorney_id_fkey,
  add constraint message_threads_attorney_fkey foreign key (firm_id, attorney_id)
    references public.attorneys (firm_id, id) on delete cascade;

alter table public.notification_log
  drop constraint notification_log_appointment_id_fkey,
  add constraint notification_log_appointment_fkey foreign key (firm_id, appointment_id)
    references public.appointments (firm_id, id) on delete set null (appointment_id);

-- Event ids are only unique within one provider account, and each firm may have its own.
alter table public.webhook_events
  add column account_id text not null default 'platform',
  drop constraint webhook_events_pkey,
  add constraint webhook_events_pkey primary key (provider, account_id, id);

-- Tables whose composite keys above don't already lead with firm_id.
create index appointments_firm_starts_idx on public.appointments (firm_id, starts_at);
create index intakes_firm_idx on public.intakes (firm_id);
create index conflict_hits_firm_idx on public.conflict_hits (firm_id);
create index documents_firm_owner_idx on public.documents (firm_id, owner_id);
create index agreements_firm_idx on public.agreements (firm_id);
create index payments_firm_idx on public.payments (firm_id);
create index message_threads_firm_idx on public.message_threads (firm_id);
create index notification_log_firm_idx on public.notification_log (firm_id);
create index audit_log_firm_idx on public.audit_log (firm_id, created_at);

-- ---------------------------------------------------------------------------
-- Authorization helpers. Staff privileges still require an MFA-verified session (aal2).
-- ---------------------------------------------------------------------------

-- The caller's firm, or null if they aren't staff or haven't completed MFA.
create function public.current_firm_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.firm_id from public.firm_memberships m
  where m.profile_id = auth.uid() and public.is_mfa_verified();
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_firm_id() is not null;
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_mfa_verified() and exists (
    select 1 from public.firm_memberships m
    where m.profile_id = auth.uid() and m.role in ('partner', 'admin')
  );
$$;

create function public.is_firm_staff(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_firm = public.current_firm_id(), false);
$$;

create function public.is_firm_manager(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_firm_staff(p_firm) and public.is_manager();
$$;

create or replace function public.current_attorney_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.attorneys a
  where a.profile_id = auth.uid() and a.firm_id = public.current_firm_id();
$$;

create function public.firm_is_public(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.firms f where f.id = p_firm and f.status = 'active');
$$;

-- Has the caller been a client of this firm? They keep seeing its directory details even if
-- the firm later stops being public.
create function public.client_has_firm(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a where a.firm_id = p_firm and a.client_id = auth.uid()
  );
$$;

-- Colleagues, and clients of the caller's firm.
create function public.staff_can_see_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.firm_memberships m
    where m.profile_id = p_profile and m.firm_id = public.current_firm_id()
  ) or exists (
    select 1 from public.appointments a
    where a.client_id = p_profile and a.firm_id = public.current_firm_id()
  ) or exists (
    select 1 from public.message_threads t
    where t.client_id = p_profile and t.firm_id = public.current_firm_id()
  );
$$;

create function public.can_manage_schedule(p_attorney uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_attorney = public.current_attorney_id() or exists (
    select 1 from public.attorneys a
    where a.id = p_attorney and public.is_firm_manager(a.firm_id)
  );
$$;

create or replace function public.can_access_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_appointment
      and (a.client_id = auth.uid()
           or public.is_firm_manager(a.firm_id)
           or a.attorney_id = public.current_attorney_id())
  );
$$;

create or replace function public.can_access_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread
      and (t.client_id = auth.uid()
           or t.attorney_id = public.current_attorney_id()
           or public.is_firm_manager(t.firm_id))
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: new tables
-- ---------------------------------------------------------------------------
alter table public.firms enable row level security;
alter table public.firm_memberships enable row level security;
alter table public.platform_admins enable row level security;

-- Directory data only. Secrets such as payment credentials must never go on this table.
-- Changes go through the service role until firm settings ship.
create policy firms_read on public.firms for select to anon, authenticated
  using (status = 'active' or public.is_firm_staff(id) or public.client_has_firm(id));

-- Readable before MFA, so sign-in can tell staff from clients. Service role writes only.
create policy firm_memberships_read on public.firm_memberships for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_firm_staff(firm_id));

-- platform_admins: no policies => service role only.

-- ---------------------------------------------------------------------------
-- Row Level Security: rewrite staff and manager policies around the firm
-- ---------------------------------------------------------------------------
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.staff_can_see_profile(id));

drop policy offices_read on public.offices;
drop policy offices_write on public.offices;
create policy offices_read on public.offices for select to anon, authenticated
  using (public.firm_is_public(firm_id) or public.is_firm_staff(firm_id) or public.client_has_firm(firm_id));
create policy offices_write on public.offices for all to authenticated
  using (public.is_firm_manager(firm_id)) with check (public.is_firm_manager(firm_id));

drop policy attorneys_read on public.attorneys;
drop policy attorneys_manage on public.attorneys;
create policy attorneys_read on public.attorneys for select to anon, authenticated
  using ((is_active and public.firm_is_public(firm_id))
         or public.is_firm_staff(firm_id) or public.client_has_firm(firm_id));
create policy attorneys_manage on public.attorneys for all to authenticated
  using (public.is_firm_manager(firm_id)) with check (public.is_firm_manager(firm_id));

drop policy consult_types_read on public.consult_types;
drop policy consult_types_write on public.consult_types;
create policy consult_types_read on public.consult_types for select to anon, authenticated
  using ((is_active and public.firm_is_public(firm_id))
         or public.is_firm_staff(firm_id) or public.client_has_firm(firm_id));
create policy consult_types_write on public.consult_types for all to authenticated
  using (public.is_firm_manager(firm_id)) with check (public.is_firm_manager(firm_id));

-- Follows whatever attorneys_read lets the caller see.
drop policy availability_rules_read on public.availability_rules;
drop policy availability_rules_write on public.availability_rules;
create policy availability_rules_read on public.availability_rules for select to anon, authenticated
  using (exists (select 1 from public.attorneys a where a.id = attorney_id));
create policy availability_rules_write on public.availability_rules for all to authenticated
  using (public.can_manage_schedule(attorney_id)) with check (public.can_manage_schedule(attorney_id));

drop policy availability_exceptions_staff on public.availability_exceptions;
create policy availability_exceptions_staff on public.availability_exceptions for all to authenticated
  using (public.can_manage_schedule(attorney_id)) with check (public.can_manage_schedule(attorney_id));

drop policy appointments_select on public.appointments;
drop policy appointments_staff_update on public.appointments;
create policy appointments_select on public.appointments for select to authenticated
  using (client_id = (select auth.uid()) or public.is_firm_manager(firm_id)
         or attorney_id = public.current_attorney_id());
create policy appointments_staff_update on public.appointments for update to authenticated
  using (public.is_firm_manager(firm_id) or attorney_id = public.current_attorney_id())
  with check (public.is_firm_manager(firm_id) or attorney_id = public.current_attorney_id());

drop policy conflict_parties_staff_read on public.conflict_parties;
drop policy conflict_parties_manage on public.conflict_parties;
create policy conflict_parties_staff_read on public.conflict_parties for select to authenticated
  using (public.is_firm_staff(firm_id));
create policy conflict_parties_manage on public.conflict_parties for all to authenticated
  using (public.is_firm_manager(firm_id)) with check (public.is_firm_manager(firm_id));

drop policy conflict_hits_staff_read on public.conflict_hits;
create policy conflict_hits_staff_read on public.conflict_hits for select to authenticated
  using (public.is_firm_manager(firm_id)
         or exists (select 1 from public.appointments a
                    where a.id = appointment_id and a.attorney_id = public.current_attorney_id()));

-- A client's documents at another firm stay invisible, even to an attorney they share.
drop policy documents_select on public.documents;
drop policy documents_insert_own on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (owner_id = (select auth.uid())
         or public.is_firm_manager(firm_id)
         or (public.is_firm_staff(firm_id) and public.attorney_has_client(owner_id)));
create policy documents_insert_own on public.documents for insert to authenticated
  with check (owner_id = (select auth.uid())
              and uploaded_by = (select auth.uid())
              and public.client_has_firm(firm_id)
              and (appointment_id is null or public.can_access_appointment(appointment_id)));

drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
  using (client_id = (select auth.uid()) or public.is_firm_manager(firm_id));

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (client_id = (select auth.uid()) or public.is_firm_manager(firm_id));

drop policy notification_log_manager_read on public.notification_log;
create policy notification_log_manager_read on public.notification_log for select to authenticated
  using (public.is_firm_manager(firm_id));

drop policy audit_log_manager_read on public.audit_log;
create policy audit_log_manager_read on public.audit_log for select to authenticated
  using (public.is_firm_manager(firm_id));

-- ---------------------------------------------------------------------------
-- Storage
--   client-documents: {firm_id}/{owner_id}/{uuid}-{filename}
--   attorney-photos:  {firm_id}/{attorney_id}/{filename}
--   avatars:          {user_id}/{filename} (unchanged)
-- ---------------------------------------------------------------------------
drop policy "client docs: owner read" on storage.objects;
drop policy "client docs: owner upload" on storage.objects;
drop policy "client docs: owner delete" on storage.objects;
create policy "client docs: read" on storage.objects for select to authenticated
  using (bucket_id = 'client-documents'
         and ((storage.foldername(name))[2] = (select auth.uid())::text
              or ((storage.foldername(name))[1] = public.current_firm_id()::text
                  and (public.is_manager()
                       or public.attorney_has_client(((storage.foldername(name))[2])::uuid)))));
create policy "client docs: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents'
              and (storage.foldername(name))[2] = (select auth.uid())::text
              and public.client_has_firm(((storage.foldername(name))[1])::uuid));
create policy "client docs: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents'
         and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy "avatars: owner read" on storage.objects;
create policy "avatars: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or public.staff_can_see_profile(((storage.foldername(name))[1])::uuid)));

drop policy "attorney photos: manager write" on storage.objects;
drop policy "attorney photos: manager update" on storage.objects;
drop policy "attorney photos: manager delete" on storage.objects;
create policy "attorney photos: manager write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attorney-photos'
              and public.is_manager()
              and (storage.foldername(name))[1] = public.current_firm_id()::text);
create policy "attorney photos: manager update" on storage.objects for update to authenticated
  using (bucket_id = 'attorney-photos'
         and public.is_manager()
         and (storage.foldername(name))[1] = public.current_firm_id()::text);
create policy "attorney photos: manager delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attorney-photos'
         and public.is_manager()
         and (storage.foldername(name))[1] = public.current_firm_id()::text);

-- ---------------------------------------------------------------------------
-- profiles.role is replaced by firm_memberships
-- ---------------------------------------------------------------------------
drop function public.current_user_role();
alter table public.profiles drop column role;
drop type public.user_role;

-- ---------------------------------------------------------------------------
-- Function privileges. Anon-visible policies call the first group.
-- ---------------------------------------------------------------------------
revoke execute on function public.current_firm_id(), public.is_firm_staff(uuid),
  public.firm_is_public(uuid), public.client_has_firm(uuid)
  from public;
grant execute on function public.current_firm_id(), public.is_firm_staff(uuid),
  public.firm_is_public(uuid), public.client_has_firm(uuid)
  to anon, authenticated;

revoke execute on function public.is_firm_manager(uuid), public.staff_can_see_profile(uuid),
  public.can_manage_schedule(uuid)
  from public, anon;
grant execute on function public.is_firm_manager(uuid), public.staff_can_see_profile(uuid),
  public.can_manage_schedule(uuid)
  to authenticated;
