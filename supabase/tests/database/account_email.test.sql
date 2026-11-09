-- Guest booking email codes: checking, attempt limits, and that only the server can see them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values ('a0000000-0000-4000-8000-000000000001', 'admin@a.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'admin');
insert into public.consult_types (id, firm_id, slug, label, mode, duration_minutes) values
  ('1a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'phone', 'Phone', 'phone', 30);
insert into public.attorneys (id, firm_id, slug, full_name) values
  ('2a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'sam-cruz', 'Sam Cruz');
insert into public.appointments (id, firm_id, attorney_id, consult_type_id, starts_at, ends_at) values
  ('3a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
   '1a000000-0000-4000-8000-000000000001', '2030-01-01 01:00+00', '2030-01-01 01:30+00'),
  ('3a000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
   '1a000000-0000-4000-8000-000000000001', '2030-01-01 02:00+00', '2030-01-01 02:30+00'),
  ('3a000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
   '1a000000-0000-4000-8000-000000000001', '2030-01-01 03:00+00', '2030-01-01 03:30+00');

insert into public.booking_email_codes (appointment_id, firm_id, email, code_hash, expires_at) values
  ('3a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'guest@x.test', repeat('a', 64), now() + interval '10 minutes'),
  ('3a000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', 'guest@x.test', repeat('a', 64), now() + interval '10 minutes'),
  ('3a000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'guest@x.test', repeat('a', 64), now() - interval '1 minute');

select throws_ok($$
  insert into public.booking_email_codes (appointment_id, firm_id, email, code_hash, expires_at)
  values ('3a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'Guest@X.test', repeat('a', 64), now())
$$, '23514', null, 'emails are stored lower-case');

-- Checking
select is(public.verify_booking_email_code('3a000000-0000-4000-8000-000000000001', 'other@x.test', repeat('a', 64)), 'missing',
  'a code is only good for the address it was sent to');
select is(public.verify_booking_email_code('3a000000-0000-4000-8000-000000000001', 'guest@x.test', repeat('b', 64)), 'wrong',
  'a wrong code is rejected');
select is(public.verify_booking_email_code('3a000000-0000-4000-8000-000000000001', 'guest@x.test', repeat('a', 64)), 'ok',
  'the right code is accepted');
select ok((select verified_at is not null from public.booking_email_codes where appointment_id = '3a000000-0000-4000-8000-000000000001'),
  'an accepted code marks the email verified');
select is(public.verify_booking_email_code('3a000000-0000-4000-8000-000000000001', 'guest@x.test', repeat('b', 64)), 'ok',
  'a verified booking stays verified');
select is(public.verify_booking_email_code('3a000000-0000-4000-8000-000000000003', 'guest@x.test', repeat('a', 64)), 'expired',
  'an expired code is rejected');

-- Attempt limit
select public.verify_booking_email_code('3a000000-0000-4000-8000-000000000002', 'guest@x.test', repeat('b', 64)) from generate_series(1, 5);
select is(public.verify_booking_email_code('3a000000-0000-4000-8000-000000000002', 'guest@x.test', repeat('a', 64)), 'locked',
  'after five wrong guesses even the right code is refused');
select ok((select verified_at is null from public.booking_email_codes where appointment_id = '3a000000-0000-4000-8000-000000000002'),
  'a locked code verifies nothing');

-- Access
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select throws_ok($$ select * from public.booking_email_codes $$, '42501', null, 'staff cannot read codes');
select throws_ok($$ select public.verify_booking_email_code('3a000000-0000-4000-8000-000000000002', 'guest@x.test', repeat('a', 64)) $$,
  '42501', null, 'staff cannot check codes');
reset role;
set local role anon;
select throws_ok($$ select * from public.booking_email_codes $$, '42501', null, 'visitors cannot read codes');
reset role;

select is((select count(*) from public.booking_email_codes where appointment_id = '3a000000-0000-4000-8000-000000000001'), 1::bigint,
  'a verified code is kept with its booking');
delete from public.appointments where id = '3a000000-0000-4000-8000-000000000001';
select is((select count(*) from public.booking_email_codes where appointment_id = '3a000000-0000-4000-8000-000000000001'), 0::bigint,
  'codes go with their booking');

select * from finish();
rollback;
