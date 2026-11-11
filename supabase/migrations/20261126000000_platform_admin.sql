-- Platform admin (Phase 7b).
--
-- Our operators (platform_admins, with two-factor) review firms that asked to go live, check
-- each attorney's roll number and year admitted against the Supreme Court's Roll of Attorneys,
-- approve, send back, suspend or reinstate firms, and mark firms as comped. Every change goes
-- through a function below that checks is_platform_admin() and writes audit_log. Nothing here
-- gives operators access to client data.

-- ---------------------------------------------------------------------------
-- Who is an operator. Needs a two-factor session, like firm managers.
-- ---------------------------------------------------------------------------
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_mfa_verified()
     and exists (select 1 from public.platform_admins p where p.profile_id = auth.uid());
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Our own record of each firm. Kept off `firms`, which is public for live firms.
-- Service role only.
-- ---------------------------------------------------------------------------
create table public.firm_platform (
  firm_id uuid primary key references public.firms (id) on delete cascade,
  comped boolean not null default false,
  -- Null while comped means no end date.
  comped_until date,
  comp_note text check (length(comp_note) <= 500),
  -- What we last told the firm when sending it back or suspending it. Cleared when it goes live.
  firm_note text check (length(firm_note) <= 1000),
  -- When the firm was first approved. Null for firms never approved.
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger firm_platform_updated_at before update on public.firm_platform
  for each row execute function public.set_updated_at();
alter table public.firm_platform enable row level security;
revoke all on public.firm_platform from anon, authenticated;

-- Firms that were already live count as approved.
insert into public.firm_platform (firm_id, approved_at)
select id, created_at from public.firms where status <> 'pending';

-- ---------------------------------------------------------------------------
-- Attorney checks. An attorney is on the public booking page only once an operator has
-- checked their roll number and year admitted. Changing the name, roll number or year
-- clears the check.
-- ---------------------------------------------------------------------------
alter table public.attorneys
  add column ibp_checked_at timestamptz,
  add column ibp_checked_by uuid references public.profiles (id) on delete set null;

-- Attorneys at firms that were already live count as checked.
update public.attorneys a set ibp_checked_at = now()
from public.firms f where f.id = a.firm_id and f.status <> 'pending';

-- Only operators (and the service role or a direct database session) can set the check.
create function public.attorneys_guard_ibp_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_privileged boolean := public.is_platform_admin() or coalesce(auth.role(), 'service_role') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not v_privileged then
      new.ibp_checked_at := null;
      new.ibp_checked_by := null;
    end if;
  else
    if not v_privileged then
      new.ibp_checked_at := old.ibp_checked_at;
      new.ibp_checked_by := old.ibp_checked_by;
    end if;
    if new.full_name is distinct from old.full_name
       or new.ibp_roll_no is distinct from old.ibp_roll_no
       or new.admitted_year is distinct from old.admitted_year then
      new.ibp_checked_at := null;
      new.ibp_checked_by := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger attorneys_guard_ibp_check before insert or update on public.attorneys
  for each row execute function public.attorneys_guard_ibp_check();

drop policy attorneys_read on public.attorneys;
create policy attorneys_read on public.attorneys for select to anon, authenticated
  using ((is_active and ibp_checked_at is not null and public.firm_is_public(firm_id))
         or public.is_firm_staff(firm_id) or public.client_has_firm(firm_id));

-- Operators can read the setup checklist too.
create or replace function public.firm_setup_status(p_firm uuid)
returns table (attorney_ready boolean, consult_ready boolean, hours_ready boolean, contact_ready boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.attorneys a where a.firm_id = p_firm and a.is_active
              and coalesce(a.ibp_roll_no, '') <> '' and a.admitted_year is not null),
    exists (select 1 from public.consult_types c where c.firm_id = p_firm and c.is_active),
    exists (select 1 from public.availability_rules r join public.attorneys a on a.id = r.attorney_id
             where a.firm_id = p_firm and a.is_active),
    exists (select 1 from public.firms f where f.id = p_firm and coalesce(f.contact_email, '') <> '')
  where public.is_firm_staff(p_firm) or public.is_platform_admin() or (select auth.role()) = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- Operator actions. Each returns a short status word and audits what it did.
-- ---------------------------------------------------------------------------

-- Marks an attorney's roll number and year as checked (or clears the check).
-- Returns 'ok', 'forbidden', 'missing' or 'incomplete' (no roll number or year to check).
create function public.admin_set_attorney_check(p_attorney uuid, p_checked boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  select id, firm_id, full_name, ibp_roll_no, admitted_year into a from public.attorneys where id = p_attorney;
  if not found then return 'missing'; end if;
  if p_checked and (coalesce(a.ibp_roll_no, '') = '' or a.admitted_year is null) then return 'incomplete'; end if;

  update public.attorneys
     set ibp_checked_at = case when p_checked then now() end,
         ibp_checked_by = case when p_checked then auth.uid() end
   where id = p_attorney;
  insert into public.audit_log (firm_id, actor_id, action, entity, entity_id, details)
  values (a.firm_id, auth.uid(),
          case when p_checked then 'platform.attorney_checked' else 'platform.attorney_unchecked' end,
          'attorneys', a.id::text,
          jsonb_build_object('name', a.full_name, 'roll_no', a.ibp_roll_no, 'admitted_year', a.admitted_year));
  return 'ok';
end;
$$;

-- p_action: 'approve' | 'send_back' | 'suspend' | 'reinstate'. p_note is what the firm is told
-- (required to send back or suspend).
-- Returns 'ok', 'forbidden', 'missing', 'wrong_status', 'note_required', 'incomplete' or
-- 'no_checked_attorney'.
create function public.admin_firm_action(p_firm uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.firm_status;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_approved timestamptz;
  v_new public.firm_status;
  s record;
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  select status into v_status from public.firms where id = p_firm for update;
  if not found then return 'missing'; end if;
  insert into public.firm_platform (firm_id) values (p_firm) on conflict (firm_id) do nothing;
  select approved_at into v_approved from public.firm_platform where firm_id = p_firm;

  if p_action = 'approve' then
    if v_status <> 'pending' then return 'wrong_status'; end if;
    select * into s from public.firm_setup_status(p_firm);
    if not (s.attorney_ready and s.consult_ready and s.hours_ready and s.contact_ready) then return 'incomplete'; end if;
    if not exists (select 1 from public.attorneys a where a.firm_id = p_firm and a.is_active and a.ibp_checked_at is not null) then
      return 'no_checked_attorney';
    end if;
    v_new := 'active';
    update public.firm_platform set approved_at = coalesce(approved_at, now()), firm_note = null where firm_id = p_firm;
  elsif p_action = 'send_back' then
    if v_status <> 'pending' then return 'wrong_status'; end if;
    if v_note is null then return 'note_required'; end if;
    v_new := 'pending';
    update public.firms set review_requested_at = null where id = p_firm;
    update public.firm_platform set firm_note = v_note where firm_id = p_firm;
  elsif p_action = 'suspend' then
    if v_status = 'suspended' then return 'wrong_status'; end if;
    if v_note is null then return 'note_required'; end if;
    v_new := 'suspended';
    update public.firm_platform set firm_note = v_note where firm_id = p_firm;
  elsif p_action = 'reinstate' then
    if v_status <> 'suspended' then return 'wrong_status'; end if;
    -- A firm suspended before it was ever approved goes back to waiting for review.
    v_new := case when v_approved is null then 'pending'::public.firm_status else 'active'::public.firm_status end;
    update public.firm_platform set firm_note = null where firm_id = p_firm;
  else
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;

  update public.firms set status = v_new where id = p_firm;
  insert into public.audit_log (firm_id, actor_id, action, entity, entity_id, details)
  values (p_firm, auth.uid(), 'platform.firm_' || case p_action when 'approve' then 'approved' when 'send_back' then 'sent_back'
                                                              when 'suspend' then 'suspended' else 'reinstated' end,
          'firms', p_firm::text,
          jsonb_strip_nulls(jsonb_build_object('from', v_status, 'to', v_new, 'note', v_note)));
  return 'ok';
end;
$$;

-- Comps a firm (free use, until an optional date) or ends the comp. Phase 8 reads this.
-- Returns 'ok', 'forbidden', 'missing' or 'past_date'.
create function public.admin_set_comp(p_firm uuid, p_comped boolean, p_until date default null, p_note text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  if not exists (select 1 from public.firms where id = p_firm) then return 'missing'; end if;
  if p_comped and p_until is not null and p_until < (now() at time zone 'Asia/Manila')::date then return 'past_date'; end if;

  insert into public.firm_platform (firm_id, comped, comped_until, comp_note)
  values (p_firm, p_comped, case when p_comped then p_until end, v_note)
  on conflict (firm_id) do update
    set comped = excluded.comped, comped_until = excluded.comped_until, comp_note = excluded.comp_note;
  insert into public.audit_log (firm_id, actor_id, action, entity, entity_id, details)
  values (p_firm, auth.uid(), case when p_comped then 'platform.comp_set' else 'platform.comp_ended' end, 'firms', p_firm::text,
          jsonb_strip_nulls(jsonb_build_object('until', case when p_comped then p_until end, 'note', v_note)));
  return 'ok';
end;
$$;

revoke execute on function public.admin_set_attorney_check(uuid, boolean), public.admin_firm_action(uuid, text, text),
  public.admin_set_comp(uuid, boolean, date, text) from public, anon;
grant execute on function public.admin_set_attorney_check(uuid, boolean), public.admin_firm_action(uuid, text, text),
  public.admin_set_comp(uuid, boolean, date, text) to authenticated;
