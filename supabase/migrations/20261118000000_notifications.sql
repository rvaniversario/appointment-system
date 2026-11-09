-- Phase 6a: email notifications.
--
-- notification_log becomes a send queue as well as the record of what was sent. Server code
-- adds rows (service role only) and sends them straight away; a worker that pg_cron calls
-- every five minutes retries whatever is still queued. Each row's dedupe_key stops the same
-- notification from being queued twice, for example when the PayMongo webhook and the
-- reconciliation job both confirm one booking.

-- One reminder per appointment no longer fits: a booking can be rescheduled more than once,
-- and alerts go to several people. dedupe_key replaces that rule.
alter table public.notification_log
  drop constraint notification_log_channel_template_appointment_id_key,
  add column dedupe_key text not null default gen_random_uuid()::text,
  -- What the template needs to render. Never holds case details or secrets.
  add column payload jsonb not null default '{}',
  add column next_attempt_at timestamptz not null default now(),
  -- Set while a worker is sending the row, so two workers never send it twice.
  add column locked_until timestamptz,
  add constraint notification_log_dedupe_key unique (dedupe_key);

create index notification_log_due_idx on public.notification_log (next_attempt_at) where status = 'queued';

-- Hands out queued rows that are due, locked for two minutes. Rows another worker holds are
-- skipped rather than waited for.
create function public.claim_notifications(p_limit integer default 20)
returns setof public.notification_log
language sql security definer set search_path = '' as $$
  update public.notification_log n
     set locked_until = now() + interval '2 minutes',
         attempts = n.attempts + 1
   where n.id in (
     select q.id from public.notification_log q
      where q.status = 'queued'
        and q.next_attempt_at <= now()
        and (q.locked_until is null or q.locked_until < now())
      order by q.next_attempt_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning n.*;
$$;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Schedule. pg_cron calls the app's worker route through pg_net. The address and the shared
-- secret live in Vault, set once per environment (see docs/saas-plan.md, Phase 6):
--   select vault.create_secret('https://your-app.example', 'app_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Until both exist the job does nothing.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.run_notification_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  -- Nothing to retry: don't wake the app.
  if not exists (
    select 1 from public.notification_log where status = 'queued' and next_attempt_at <= now()
  ) then
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

select cron.schedule('send-notifications', '*/5 * * * *', 'select public.run_notification_worker()');
