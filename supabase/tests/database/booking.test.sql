-- Booking functions: conflict checks stay within the firm, and only server code can call them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values ('c0000000-0000-4000-8000-00000000000a', 'client@test.test');

insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active'),
  ('f0000000-0000-4000-8000-00000000000b', 'firm-b', 'Firm B', 'active'),
  ('f0000000-0000-4000-8000-00000000000c', 'firm-pending', 'Firm Pending', 'pending');

insert into public.consult_types (id, firm_id, slug, label, mode, duration_minutes) values
  ('1a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'phone', 'Phone', 'phone', 30);
insert into public.attorneys (id, firm_id, slug, full_name) values
  ('2a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'sam-cruz', 'Sam Cruz');

insert into public.conflict_parties (firm_id, name, matter) values
  ('f0000000-0000-4000-8000-00000000000a', 'Amara Smith', 'Smith v. Holdings'),
  ('f0000000-0000-4000-8000-00000000000a', 'Kevin Park', 'People v. Park'),
  ('f0000000-0000-4000-8000-00000000000a', 'Unrelated Person', 'Other matter'),
  -- Firm B knows the same opposing party, but its records must not affect firm A.
  ('f0000000-0000-4000-8000-00000000000b', 'Amara Smith', 'Firm B matter');

insert into public.appointments (id, firm_id, attorney_id, client_id, consult_type_id, starts_at, ends_at) values
  ('3a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-00000000000a', '1a000000-0000-4000-8000-000000000001', '2030-01-01 01:00+00', '2030-01-01 01:30+00');

-- The client is Kevin Park; the opposing party is a misspelling of Amara Smith.
insert into public.intakes (firm_id, appointment_id, first_name, last_name, email, phone, case_type, details, opposing_party, privacy_consent_at) values
  ('f0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000001', 'Kevin', 'Park',
   'client@test.test', '639171234567', 'Civil', 'details', 'Amara Smyth', now());

select is(public.run_conflict_check('3a000000-0000-4000-8000-000000000001'), 2, 'finds both the client and the opposing party');
select is(
  (select array_agg(p.name order by p.name) from public.conflict_hits h join public.conflict_parties p on p.id = h.conflict_party_id),
  array['Amara Smith', 'Kevin Park'],
  'fuzzy-matches names and ignores unrelated parties'
);
select is((select count(*)::int from public.conflict_hits where firm_id <> 'f0000000-0000-4000-8000-00000000000a'), 0,
  'never matches another firm''s parties');
select is(public.run_conflict_check('3a000000-0000-4000-8000-000000000001'), 0, 'running it again adds no duplicates');

select ok(public.firm_can_accept_bookings('f0000000-0000-4000-8000-00000000000a'), 'an active firm takes bookings');
select ok(not public.firm_can_accept_bookings('f0000000-0000-4000-8000-00000000000c'), 'a pending firm does not');

-- Only the service role may run these; browsers go through server actions.
set local role anon;
select throws_ok($$select public.run_conflict_check('3a000000-0000-4000-8000-000000000001')$$, '42501', null,
  'anon cannot run conflict checks');
select throws_ok($$select public.firm_can_accept_bookings('f0000000-0000-4000-8000-00000000000a')$$, '42501', null,
  'anon cannot call firm_can_accept_bookings');
reset role;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select public.run_conflict_check('3a000000-0000-4000-8000-000000000001')$$, '42501', null,
  'signed-in users cannot run conflict checks');
-- The client can read their own appointment, but the token hash only proves possession of a cookie.
select is((select count(*)::int from public.appointments), 1, 'the client still sees their own appointment');
reset role;

select * from finish();
rollback;
