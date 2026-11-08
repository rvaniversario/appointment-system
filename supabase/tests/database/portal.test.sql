-- Client portal: confirmed_at, read receipts, and what a client may change directly.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000003', 'attorney@a.test'),
  ('c0000000-0000-4000-8000-00000000000a', 'client@a.test'),
  ('c0000000-0000-4000-8000-00000000000b', 'stranger@b.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'attorney');
insert into public.attorneys (id, firm_id, profile_id, slug, full_name) values
  ('a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000003', 'atty', 'Atty A');
insert into public.consult_types (id, firm_id, slug, label, mode, duration_minutes) values
  ('c1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'call', 'Call', 'phone', 30);

-- ---------------------------------------------------------------------------
-- confirmed_at
-- ---------------------------------------------------------------------------
insert into public.appointments (id, firm_id, attorney_id, client_id, consult_type_id, starts_at, ends_at, status) values
  ('a2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000001',
   now() + interval '3 days', now() + interval '3 days 30 minutes', 'held');

select is((select confirmed_at from public.appointments where id = 'a2000000-0000-4000-8000-000000000001'), null,
  'a hold has no confirmed_at');
update public.appointments set status = 'confirmed' where id = 'a2000000-0000-4000-8000-000000000001';
select isnt((select confirmed_at from public.appointments where id = 'a2000000-0000-4000-8000-000000000001'), null,
  'confirming sets confirmed_at');
update public.appointments set status = 'canceled' where id = 'a2000000-0000-4000-8000-000000000001';
select isnt((select confirmed_at from public.appointments where id = 'a2000000-0000-4000-8000-000000000001'), null,
  'canceling keeps confirmed_at, so the portal still lists it');

select throws_ok($$update public.firms set cancellation_cutoff_hours = 1000$$, '23514', null,
  'the cancellation cutoff is capped at two weeks');

-- ---------------------------------------------------------------------------
-- Clients change bookings only through server code
-- ---------------------------------------------------------------------------
update public.appointments set status = 'confirmed' where id = 'a2000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
update public.appointments set starts_at = starts_at + interval '1 hour' where id = 'a2000000-0000-4000-8000-000000000001';
reset role;
select is((select status::text from public.appointments where id = 'a2000000-0000-4000-8000-000000000001'), 'confirmed',
  'the booking is untouched');
select is(
  (select ends_at - starts_at from public.appointments where id = 'a2000000-0000-4000-8000-000000000001'),
  interval '30 minutes', 'a client cannot move their own appointment directly');

-- ---------------------------------------------------------------------------
-- Read receipts
-- ---------------------------------------------------------------------------
insert into public.message_threads (id, firm_id, client_id, attorney_id) values
  ('a3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a',
   'c0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001');
insert into public.messages (id, thread_id, sender_id, body) values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'From the attorney'),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'From the client');

-- A stranger can't mark someone else's thread read.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000b","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select public.mark_thread_read('a3000000-0000-4000-8000-000000000001')$$, '42501', null,
  'an outsider cannot mark a thread read');
reset role;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$select public.mark_thread_read('a3000000-0000-4000-8000-000000000001')$$, 'the client can mark their thread read');
update public.messages set body = 'edited' where id = 'a4000000-0000-4000-8000-000000000001';
reset role;

select isnt((select read_at from public.messages where id = 'a4000000-0000-4000-8000-000000000001'), null,
  'the attorney''s message is now read');
select is((select read_at from public.messages where id = 'a4000000-0000-4000-8000-000000000002'), null,
  'the client''s own message is not marked read by them');
select is((select body from public.messages where id = 'a4000000-0000-4000-8000-000000000001'), 'From the attorney',
  'nobody can edit a sent message');

set local role anon;
select throws_ok($$select public.mark_thread_read('a3000000-0000-4000-8000-000000000001')$$, '42501', null,
  'anon cannot call mark_thread_read');
reset role;

select * from finish();
rollback;
