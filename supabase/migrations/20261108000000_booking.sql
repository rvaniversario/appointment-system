-- Public booking on real data.
--
-- Visitors book without signing in, so the booking wizard runs in server code with the
-- service role. A random token in an httpOnly cookie ties each request to its appointment;
-- only its SHA-256 hash is stored here.

alter table public.appointments add column booking_token_hash text;
create unique index appointments_booking_token_idx on public.appointments (booking_token_hash)
  where booking_token_hash is not null;

-- Consultation agreement shown at booking. Null means the standard template.
alter table public.firms add column agreement_text text check (length(agreement_text) <= 20000);

-- Can this firm take new bookings? Phase 8 adds the subscription check here.
create function public.firm_can_accept_bookings(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.firms f where f.id = p_firm and f.status = 'active');
$$;

-- Matches the intake's client and opposing party against the firm's known parties and
-- records the hits for staff. The client is never told the result.
create function public.run_conflict_check(p_appointment uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.conflict_hits (firm_id, appointment_id, conflict_party_id, matched_name, similarity)
  select distinct on (p.id) i.firm_id, i.appointment_id, p.id, n.name,
         extensions.similarity(lower(p.name), lower(n.name))
  from public.intakes i
  cross join lateral (values
    (trim(i.first_name || ' ' || i.last_name)),
    (nullif(trim(i.opposing_party), ''))
  ) as n(name)
  join public.conflict_parties p on p.firm_id = i.firm_id
  where i.appointment_id = p_appointment
    and n.name is not null
    and extensions.similarity(lower(p.name), lower(n.name)) >= 0.45
  order by p.id, extensions.similarity(lower(p.name), lower(n.name)) desc
  on conflict (appointment_id, conflict_party_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Server code only.
revoke execute on function public.firm_can_accept_bookings(uuid), public.run_conflict_check(uuid)
  from public, anon, authenticated;
grant execute on function public.firm_can_accept_bookings(uuid), public.run_conflict_check(uuid)
  to service_role;
