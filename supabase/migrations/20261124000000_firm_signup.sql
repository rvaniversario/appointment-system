-- Phase 7a: firms sign themselves up.
--
-- Anyone can sign up a firm. The signer confirms their email with a code we send (our own,
-- like guest booking codes: it carries our name and stays off Supabase's auth email limit),
-- then gets an admin account in a new firm whose status is 'pending'. A pending firm can set
-- everything up in the dashboard, but its booking page isn't public until a platform admin
-- checks the attorney's IBP roll number and approves it (Phase 7b).

alter table public.firms
  add column created_by uuid references public.profiles (id) on delete set null,
  -- When the firm finished setup and asked to go live. Cleared if the review sends it back.
  add column review_requested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Email codes for signup. One per address. Service role only.
-- ---------------------------------------------------------------------------
create table public.signup_email_codes (
  email text primary key check (email = lower(email) and length(email) <= 254),
  code_hash text not null check (length(code_hash) = 64),
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  sends smallint not null default 1,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.signup_email_codes enable row level security;
revoke all on public.signup_email_codes from anon, authenticated;

-- 'ok', 'wrong', 'expired', 'locked' (more than five guesses) or 'missing'. Each guess is
-- counted in one statement, so guesses can't race past the limit. A verified code stays
-- verified for 30 minutes, long enough to finish the form.
create function public.verify_signup_email_code(p_email text, p_code_hash text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.signup_email_codes;
begin
  select * into r from public.signup_email_codes where email = p_email;
  if not found then return 'missing'; end if;
  if r.verified_at is not null then
    return case when r.verified_at > now() - interval '30 minutes' and r.code_hash = p_code_hash then 'ok' else 'expired' end;
  end if;

  update public.signup_email_codes set attempts = attempts + 1
   where email = p_email and verified_at is null
  returning * into r;
  if not found then return 'missing'; end if;

  if r.attempts > 5 then return 'locked'; end if;
  if r.expires_at < now() then return 'expired'; end if;
  if r.code_hash <> p_code_hash then return 'wrong'; end if;

  update public.signup_email_codes set verified_at = now() where email = p_email;
  return 'ok';
end;
$$;
revoke execute on function public.verify_signup_email_code(text, text) from public, anon, authenticated;
grant execute on function public.verify_signup_email_code(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Creating the firm. One transaction: the firm (pending), the signer as its admin, and the
-- first attorney, linked to the signer when they are the attorney. Service role only; the
-- server calls it after the email code checks out.
-- ---------------------------------------------------------------------------
create function public.create_signup_firm(
  p_profile uuid,
  p_firm_name text,
  p_firm_slug text,
  p_attorney_name text,
  p_attorney_slug text,
  p_ibp_roll_no text,
  p_admitted_year smallint,
  p_signer_is_attorney boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_firm uuid;
  v_email text;
  v_attorney uuid;
begin
  if exists (select 1 from public.firm_memberships where profile_id = p_profile) then
    raise exception 'already_staff' using errcode = 'P0001';
  end if;
  select email into v_email from public.profiles where id = p_profile;
  if v_email is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  insert into public.firms (slug, name, status, contact_email, created_by)
  values (p_firm_slug, p_firm_name, 'pending', v_email, p_profile)
  returning id into v_firm;

  insert into public.firm_memberships (profile_id, firm_id, role) values (p_profile, v_firm, 'admin');

  insert into public.attorneys (firm_id, slug, full_name, ibp_roll_no, admitted_year, profile_id)
  values (v_firm, p_attorney_slug, p_attorney_name, p_ibp_roll_no, p_admitted_year,
          case when p_signer_is_attorney then p_profile end)
  returning id into v_attorney;

  insert into public.audit_log (firm_id, actor_id, action, entity, entity_id, details)
  values (v_firm, p_profile, 'firm.signed_up', 'firms', v_firm::text,
          jsonb_build_object('signer_is_attorney', p_signer_is_attorney, 'attorney_id', v_attorney));
  return v_firm;
end;
$$;
revoke execute on function public.create_signup_firm(uuid, text, text, text, text, text, smallint, boolean) from public, anon, authenticated;
grant execute on function public.create_signup_firm(uuid, text, text, text, text, text, smallint, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Setup checklist. What a firm needs before it can ask to go live.
-- ---------------------------------------------------------------------------
create function public.firm_setup_status(p_firm uuid)
returns table (attorney_ready boolean, consult_ready boolean, hours_ready boolean, contact_ready boolean)
language sql stable security definer set search_path = '' as $$
  select
    -- An active attorney with the details we check against the Supreme Court's roll.
    exists (select 1 from public.attorneys a where a.firm_id = p_firm and a.is_active
              and coalesce(a.ibp_roll_no, '') <> '' and a.admitted_year is not null),
    exists (select 1 from public.consult_types c where c.firm_id = p_firm and c.is_active),
    exists (select 1 from public.availability_rules r join public.attorneys a on a.id = r.attorney_id
             where a.firm_id = p_firm and a.is_active),
    exists (select 1 from public.firms f where f.id = p_firm and coalesce(f.contact_email, '') <> '')
  where public.is_firm_staff(p_firm) or (select auth.role()) = 'service_role';
$$;
revoke execute on function public.firm_setup_status(uuid) from public, anon;
grant execute on function public.firm_setup_status(uuid) to authenticated, service_role;

-- A partner or admin of a pending firm asks for review once setup is complete.
-- Returns 'requested', 'incomplete', 'not_pending' or 'forbidden'.
create function public.request_firm_review() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_firm uuid := public.current_firm_id();
  v_status public.firm_status;
  s record;
begin
  if v_firm is null or not public.is_manager() then return 'forbidden'; end if;
  select status into v_status from public.firms where id = v_firm;
  if v_status <> 'pending' then return 'not_pending'; end if;

  select * into s from public.firm_setup_status(v_firm);
  if not (s.attorney_ready and s.consult_ready and s.hours_ready and s.contact_ready) then return 'incomplete'; end if;

  update public.firms set review_requested_at = coalesce(review_requested_at, now()) where id = v_firm;
  insert into public.audit_log (firm_id, actor_id, action, entity, entity_id)
  values (v_firm, auth.uid(), 'firm.review_requested', 'firms', v_firm::text);
  return 'requested';
end;
$$;
revoke execute on function public.request_firm_review() from public, anon;
grant execute on function public.request_firm_review() to authenticated;
