-- Phase 6b: guests confirm their email before booking.
--
-- A visitor who isn't signed in types an email on the intake form. Before the intake is saved
-- or tied to any account, we email a 6-digit code to that address and the visitor types it
-- back. Only the code's hash is stored, and only the server (service role) touches this table.

create table public.booking_email_codes (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 254),
  code_hash text not null check (length(code_hash) = 64),
  expires_at timestamptz not null,
  -- Wrong guesses since the last code was sent.
  attempts smallint not null default 0,
  -- Codes sent for this booking, to cap resends.
  sends smallint not null default 1,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.booking_email_codes enable row level security;
-- No policies: clients and staff never read codes.
revoke all on public.booking_email_codes from anon, authenticated;

create index booking_email_codes_firm_idx on public.booking_email_codes (firm_id);

-- Checks a code. Every call counts as an attempt, in one statement, so parallel guesses
-- can't get past the limit. Returns 'ok', 'wrong', 'expired', 'locked' or 'missing'.
create function public.verify_booking_email_code(p_appointment uuid, p_email text, p_code_hash text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.booking_email_codes;
begin
  select * into r from public.booking_email_codes where appointment_id = p_appointment;
  if not found or r.email <> p_email then return 'missing'; end if;
  if r.verified_at is not null then return 'ok'; end if;

  update public.booking_email_codes
     set attempts = attempts + 1
   where appointment_id = p_appointment and verified_at is null
  returning * into r;
  if not found then return 'ok'; end if;

  if r.attempts > 5 then return 'locked'; end if;
  if r.expires_at < now() then return 'expired'; end if;
  if r.code_hash <> p_code_hash then return 'wrong'; end if;

  update public.booking_email_codes set verified_at = now() where appointment_id = p_appointment;
  return 'ok';
end;
$$;
revoke execute on function public.verify_booking_email_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_booking_email_code(uuid, text, text) to service_role;
