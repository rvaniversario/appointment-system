-- Reminder windows, claiming each reminder once, and the monthly text cap.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@a.test'),
  ('a0000000-0000-4000-8000-000000000002', 'admin@b.test'),
  ('c0000000-0000-4000-8000-000000000001', 'client@x.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active'),
  ('f0000000-0000-4000-8000-00000000000b', 'firm-b', 'Firm B', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'admin'),
  ('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000b', 'admin');
insert into public.consult_types (id, firm_id, slug, label, mode, duration_minutes) values
  ('1a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'phone', 'Phone', 'phone', 30);
insert into public.attorneys (id, firm_id, slug, full_name) values
  ('2a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'sam-cruz', 'Sam Cruz');

select is((select sms_monthly_cap from public.firms where id = 'f0000000-0000-4000-8000-00000000000a'), 200, 'firms start with a cap of 200 texts');

-- A: tomorrow, booked days ago             -> 24h reminder due
-- B: in 22 hours, booked an hour ago       -> nothing (the confirmation is enough)
-- C: in 50 minutes, booked yesterday       -> 1h reminder due
-- D: in 40 minutes, canceled               -> nothing
-- E: in 5 minutes, booked yesterday        -> nothing (too late to be useful)
-- F: in 3 days                             -> nothing yet
insert into public.appointments (id, firm_id, attorney_id, consult_type_id, client_id, status, starts_at, ends_at, created_at)
select v.id::uuid, 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', v.status::public.appointment_status, now() + v.starts, now() + v.starts + interval '30 minutes', now() - v.age
  from (values
    ('3a000000-0000-4000-8000-00000000000a', 'confirmed', interval '23 hours 30 minutes', interval '3 days'),
    ('3a000000-0000-4000-8000-00000000000b', 'confirmed', interval '22 hours', interval '1 hour'),
    ('3a000000-0000-4000-8000-00000000000c', 'confirmed', interval '50 minutes', interval '1 day'),
    ('3a000000-0000-4000-8000-00000000000d', 'canceled', interval '40 minutes', interval '1 day'),
    ('3a000000-0000-4000-8000-00000000000e', 'confirmed', interval '5 minutes', interval '1 day'),
    ('3a000000-0000-4000-8000-00000000000f', 'confirmed', interval '3 days', interval '1 day')
  ) as v(id, status, starts, age);

select set_eq(
  $$ select appointment_id::text || ' ' || kind from public.due_reminders() $$,
  array['3a000000-0000-4000-8000-00000000000a 24h', '3a000000-0000-4000-8000-00000000000c 1h'],
  'only bookings that just entered a window, were booked well ahead and still stand are due');

select set_eq(
  $$ select appointment_id::text || ' ' || kind from public.claim_due_reminders() $$,
  array['3a000000-0000-4000-8000-00000000000a 24h', '3a000000-0000-4000-8000-00000000000c 1h'],
  'claiming returns the due reminders');
select is_empty($$ select * from public.claim_due_reminders() $$, 'a reminder is claimed only once');
select is_empty($$ select * from public.due_reminders() $$, 'claimed reminders are no longer due');

update public.appointments set starts_at = now() + interval '23 hours', ends_at = now() + interval '23 hours 30 minutes'
 where id = '3a000000-0000-4000-8000-00000000000a';
select set_eq($$ select appointment_id::text || ' ' || kind from public.claim_due_reminders() $$,
  array['3a000000-0000-4000-8000-00000000000a 24h'], 'a rescheduled booking gets a reminder for its new time');

update public.firms set status = 'suspended' where id = 'f0000000-0000-4000-8000-00000000000a';
update public.appointments set starts_at = now() + interval '22 hours 30 minutes', ends_at = now() + interval '22 hours 45 minutes'
 where id = '3a000000-0000-4000-8000-00000000000a';
select is_empty($$ select * from public.due_reminders() $$, 'suspended firms send no reminders');
update public.firms set status = 'active' where id = 'f0000000-0000-4000-8000-00000000000a';

-- Text cap
update public.firms set sms_monthly_cap = 2 where id = 'f0000000-0000-4000-8000-00000000000a';
select ok(public.reserve_sms('f0000000-0000-4000-8000-00000000000a'), 'the first text fits');
select ok(public.reserve_sms('f0000000-0000-4000-8000-00000000000a'), 'the second text fits');
select ok(not public.reserve_sms('f0000000-0000-4000-8000-00000000000a'), 'the third text is over the cap');
select is((select sent from public.sms_usage where firm_id = 'f0000000-0000-4000-8000-00000000000a' and month = public.sms_month()), 2,
  'a refused text is not counted');
select public.release_sms('f0000000-0000-4000-8000-00000000000a', public.sms_month());
select ok(public.reserve_sms('f0000000-0000-4000-8000-00000000000a'), 'a text given back can be used again');
select is((select sent from public.sms_usage where firm_id = 'f0000000-0000-4000-8000-00000000000a' and month = public.sms_month()), 2,
  'the count never goes over the cap');
update public.firms set sms_monthly_cap = 0 where id = 'f0000000-0000-4000-8000-00000000000b';
select ok(not public.reserve_sms('f0000000-0000-4000-8000-00000000000b'), 'a cap of 0 turns texts off');
select ok(not public.reserve_sms('f0000000-0000-4000-8000-0000000000ff'), 'an unknown firm gets no texts');
select is(public.sms_month(), date_trunc('month', now() at time zone 'Asia/Manila')::date, 'months follow Philippine time');
select throws_ok($$ insert into public.sms_usage (firm_id, month) values ('f0000000-0000-4000-8000-00000000000b', '2030-01-15') $$,
  '23514', null, 'usage is kept per calendar month');

-- Access
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select is((select sent from public.sms_usage where firm_id = 'f0000000-0000-4000-8000-00000000000a'), 2, 'admins see their firm''s text count');
select throws_ok($$ select public.reserve_sms('f0000000-0000-4000-8000-00000000000a') $$, '42501', null, 'staff cannot spend texts');
select throws_ok($$ select * from public.claim_due_reminders() $$, '42501', null, 'staff cannot claim reminders');
select throws_ok($$ select * from public.appointment_reminders $$, '42501', null, 'staff cannot read reminder claims');
select throws_ok($$ update public.sms_usage set sent = 0 $$, '42501', null, 'staff cannot reset the count');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}';
select is_empty($$ select * from public.sms_usage where firm_id = 'f0000000-0000-4000-8000-00000000000a' $$, 'other firms cannot see the count');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is_empty($$ select * from public.sms_usage $$, 'clients cannot see text counts');
reset role;
set local role anon;
select throws_ok($$ select * from public.sms_usage $$, '42501', null, 'visitors cannot read text counts');
select throws_ok($$ select * from public.due_reminders() $$, '42501', null, 'visitors cannot list reminders');
reset role;

delete from public.appointments where id = '3a000000-0000-4000-8000-00000000000c';
select is((select count(*) from public.appointment_reminders where appointment_id = '3a000000-0000-4000-8000-00000000000c'), 0::bigint,
  'reminder claims go with their booking');

select * from finish();
rollback;
