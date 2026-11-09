-- The notification queue: claiming, de-duplication, scheduling and who may touch it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values ('a0000000-0000-4000-8000-000000000001', 'admin@a.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'admin');

insert into public.notification_log (id, firm_id, channel, template, recipient, dedupe_key, next_attempt_at) values
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'email', 'booking_confirmed', 'a@x.test', 'k1', now() - interval '1 minute'),
  ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', 'email', 'booking_confirmed', 'b@x.test', 'k2', now() + interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'email', 'booking_confirmed', 'c@x.test', 'k3', now() - interval '1 minute');
update public.notification_log set status = 'sent' where id = 'e0000000-0000-4000-8000-000000000003';

select throws_ok($$
  insert into public.notification_log (firm_id, channel, template, recipient, dedupe_key)
  values ('f0000000-0000-4000-8000-00000000000a', 'email', 'booking_confirmed', 'a@x.test', 'k1')
$$, '23505', null, 'the same dedupe key cannot be queued twice');

select lives_ok($$
  insert into public.notification_log (firm_id, channel, template, recipient, appointment_id)
  values ('f0000000-0000-4000-8000-00000000000a', 'email', 'reminder', 'a@x.test', null),
         ('f0000000-0000-4000-8000-00000000000a', 'email', 'reminder', 'a@x.test', null)
$$, 'rows without a key get a unique one');
delete from public.notification_log where template = 'reminder';

select is((select array_agg(id::text) from public.claim_notifications(10)),
  array['e0000000-0000-4000-8000-000000000001'],
  'only queued rows that are due are claimed');
select is((select attempts from public.notification_log where id = 'e0000000-0000-4000-8000-000000000001'), 1::smallint,
  'claiming counts an attempt');
select ok((select locked_until > now() from public.notification_log where id = 'e0000000-0000-4000-8000-000000000001'),
  'a claimed row is locked');
select is((select count(*) from public.claim_notifications(10)), 0::bigint, 'a locked row is not claimed again');

update public.notification_log set locked_until = now() - interval '1 second' where id = 'e0000000-0000-4000-8000-000000000001';
select is((select count(*) from public.claim_notifications(10)), 1::bigint, 'a row whose lock lapsed can be claimed again');

select ok(exists (select 1 from cron.job where jobname = 'send-notifications' and schedule = '*/5 * * * *'),
  'the worker is scheduled every five minutes');
select lives_ok($$select public.run_notification_worker()$$, 'the worker job does nothing without its Vault secrets');

set local role anon;
select throws_ok($$select * from public.claim_notifications(1)$$, '42501', null, 'anon cannot claim notifications');
select throws_ok($$select public.run_notification_worker()$$, '42501', null, 'anon cannot run the worker');
reset role;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.notification_log), 3::bigint, 'a firm admin can read the firm''s notifications');
select throws_ok($$select * from public.claim_notifications(1)$$, '42501', null, 'a firm admin cannot claim notifications');
select throws_ok($$select public.run_notification_worker()$$, '42501', null, 'a firm admin cannot run the worker');
select throws_ok($$
  insert into public.notification_log (firm_id, channel, template, recipient)
  values ('f0000000-0000-4000-8000-00000000000a', 'email', 'x', 'x@x.test')
$$, '42501', null, 'a firm admin cannot queue notifications');
update public.notification_log set status = 'sent';
reset role;
select is((select count(*) from public.notification_log
            where firm_id = 'f0000000-0000-4000-8000-00000000000a' and status = 'sent'), 1::bigint,
  'a firm admin cannot change notifications');

select * from finish();
rollback;
