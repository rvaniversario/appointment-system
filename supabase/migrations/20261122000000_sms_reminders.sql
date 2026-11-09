-- Phase 6c: SMS through PhilSMS, 24-hour and 1-hour reminders, and a monthly SMS cap per firm.
--
-- Reminders: the scheduled worker asks claim_due_reminders() which bookings have just entered
-- a reminder window, then queues their emails and texts in notification_log like any other
-- notification. Each (booking, kind, start time) is claimed once, so a rescheduled booking
-- gets fresh reminders for its new time and none for the old one.
--
-- SMS cap: texts cost us money, so each firm may send at most sms_monthly_cap texts per
-- calendar month (Philippine time). Emails are never capped. Phase 8 replaces the default
-- with the plan's allowance; until then an operator changes it per firm:
--   update firms set sms_monthly_cap = 500 where slug = '...';

alter table public.firms
  add column sms_monthly_cap integer not null default 200 check (sms_monthly_cap between 0 and 100000);

-- ---------------------------------------------------------------------------
-- Reminder windows
-- ---------------------------------------------------------------------------
-- 24h: sent from 24 hours before the start until 20 hours before, for bookings made more
--      than a day ahead (a booking made today already has its confirmation).
-- 1h:  sent from 1 hour before until 10 minutes before, for bookings made at least two
--      hours ahead.
-- The slack after each window opens lets the five-minute worker catch up after an outage
-- without texting someone after it's useful.
create table public.appointment_reminders (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  kind text not null check (kind in ('24h', '1h')),
  starts_at timestamptz not null,
  firm_id uuid not null references public.firms (id),
  claimed_at timestamptz not null default now(),
  primary key (appointment_id, kind, starts_at)
);
alter table public.appointment_reminders enable row level security;
revoke all on public.appointment_reminders from anon, authenticated;

create function public.due_reminders()
returns table (appointment_id uuid, kind text, starts_at timestamptz, firm_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.id, w.kind, a.starts_at, a.firm_id
    from public.appointments a
    join public.firms f on f.id = a.firm_id and f.status = 'active'
    cross join (values
      ('24h', interval '24 hours', interval '20 hours', interval '24 hours'),
      ('1h', interval '1 hour', interval '10 minutes', interval '2 hours')
    ) as w(kind, opens, closes, booked_ahead)
   where a.status = 'confirmed'
     and a.review_status <> 'declined'
     and a.client_id is not null
     and now() >= a.starts_at - w.opens
     and now() < a.starts_at - w.closes
     and a.created_at <= a.starts_at - w.booked_ahead
     and not exists (
       select 1 from public.appointment_reminders r
        where r.appointment_id = a.id and r.kind = w.kind and r.starts_at = a.starts_at);
$$;
revoke execute on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;

-- Marks due reminders as taken and returns them. Two workers can't claim the same one.
create function public.claim_due_reminders(p_limit integer default 50)
returns table (appointment_id uuid, kind text, starts_at timestamptz)
language sql security definer set search_path = '' as $$
  insert into public.appointment_reminders (appointment_id, kind, starts_at, firm_id)
  select d.appointment_id, d.kind, d.starts_at, d.firm_id
    from public.due_reminders() d
   order by d.starts_at
   limit greatest(1, least(p_limit, 200))
  on conflict do nothing
  returning appointment_reminders.appointment_id, appointment_reminders.kind, appointment_reminders.starts_at;
$$;
revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

create index appointments_confirmed_starts_idx on public.appointments (starts_at) where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- SMS usage
-- ---------------------------------------------------------------------------
create table public.sms_usage (
  firm_id uuid not null references public.firms (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  sent integer not null default 0 check (sent >= 0),
  primary key (firm_id, month)
);
alter table public.sms_usage enable row level security;
revoke all on public.sms_usage from anon, authenticated;
grant select on public.sms_usage to authenticated;
-- Partners and admins see their own firm's count (shown in firm settings).
create policy sms_usage_manager_read on public.sms_usage for select to authenticated
  using (firm_id = public.current_firm_id() and public.is_manager());

-- The current month in Philippine time.
create function public.sms_month() returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'Asia/Manila')::date;
$$;

-- Takes one text from the firm's allowance for this month. False when the cap is reached.
-- One statement, so concurrent senders can't go over the cap.
create function public.reserve_sms(p_firm uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_cap integer;
  v_month date := public.sms_month();
  v_ok boolean;
begin
  select sms_monthly_cap into v_cap from public.firms where id = p_firm;
  if v_cap is null or v_cap <= 0 then
    return false;
  end if;
  insert into public.sms_usage as u (firm_id, month, sent) values (p_firm, v_month, 1)
  on conflict (firm_id, month) do update set sent = u.sent + 1 where u.sent < v_cap
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke execute on function public.reserve_sms(uuid) from public, anon, authenticated;
grant execute on function public.reserve_sms(uuid) to service_role;

-- Gives a text back when the provider refused it (nothing was sent, so it shouldn't count).
create function public.release_sms(p_firm uuid, p_month date) returns void
language sql security definer set search_path = '' as $$
  update public.sms_usage set sent = greatest(sent - 1, 0) where firm_id = p_firm and month = p_month;
$$;
revoke execute on function public.release_sms(uuid, date) from public, anon, authenticated;
grant execute on function public.release_sms(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- The scheduled worker now also wakes the app when a reminder is due.
-- ---------------------------------------------------------------------------
create or replace function public.run_notification_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  -- Nothing to send or remind: don't wake the app.
  if not exists (
    select 1 from public.notification_log where status = 'queued' and next_attempt_at <= now()
  ) and not exists (select 1 from public.due_reminders()) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/send-notifications',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function public.run_notification_worker() from public, anon, authenticated;
