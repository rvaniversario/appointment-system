-- Staff dashboard: conflict search stays in the firm, weekly hours follow schedule rights,
-- and only partners and admins can move a booking to another attorney.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'partner@a.test'),
  ('a0000000-0000-4000-8000-000000000003', 'attorney1@a.test'),
  ('a0000000-0000-4000-8000-000000000004', 'attorney2@a.test'),
  ('b0000000-0000-4000-8000-000000000001', 'admin@b.test'),
  ('c0000000-0000-4000-8000-00000000000a', 'client@a.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active'),
  ('f0000000-0000-4000-8000-00000000000b', 'firm-b', 'Firm B', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'partner'),
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'attorney'),
  ('a0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-00000000000a', 'attorney'),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'admin');
insert into public.attorneys (id, firm_id, profile_id, slug, full_name) values
  ('a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000003', 'one', 'Attorney One'),
  ('a1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000004', 'two', 'Attorney Two');
insert into public.consult_types (id, firm_id, slug, label, mode, duration_minutes) values
  ('c1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'call', 'Call', 'phone', 30);
insert into public.appointments (id, firm_id, attorney_id, client_id, consult_type_id, starts_at, ends_at, status) values
  ('a2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000001',
   '2030-01-01 01:00+00', '2030-01-01 01:30+00', 'confirmed');
insert into public.conflict_parties (firm_id, name, matter) values
  ('f0000000-0000-4000-8000-00000000000a', 'Amara Smith', 'Smith v. Holdings'),
  ('f0000000-0000-4000-8000-00000000000b', 'Amara Smith', 'Firm B matter');

create function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conflict search
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-000000000003');
select is((select array_agg(matter) from public.search_conflict_parties('Amara Smyth')), array['Smith v. Holdings'],
  'fuzzy search finds the firm''s own record and never another firm''s');
select is((select count(*)::int from public.search_conflict_parties('Holdings')), 1, 'search also matches the matter');
select is((select count(*)::int from public.search_conflict_parties('a')), 0, 'one-letter searches return nothing');
reset role;

select pg_temp.sign_in('c0000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.search_conflict_parties('Amara Smith')), 0, 'a client sees no conflict records');
reset role;

-- ---------------------------------------------------------------------------
-- Weekly hours
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-000000000003');
select lives_ok($$select public.replace_weekly_hours('a1000000-0000-4000-8000-000000000001',
  '[{"weekday":1,"start_time":"09:00","end_time":"12:00"},{"weekday":1,"start_time":"13:00","end_time":"17:00"}]')$$,
  'an attorney can set their own hours');
select throws_ok($$select public.replace_weekly_hours('a1000000-0000-4000-8000-000000000002', '[]')$$, '42501', null,
  'an attorney cannot change a colleague''s hours');
reset role;
select is((select count(*)::int from public.availability_rules where attorney_id = 'a1000000-0000-4000-8000-000000000001'), 2,
  'both blocks were saved');

select pg_temp.sign_in('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.replace_weekly_hours('a1000000-0000-4000-8000-000000000002',
  '[{"weekday":2,"start_time":"10:00","end_time":"11:00"}]')$$, 'a partner can set any attorney''s hours in the firm');
select throws_ok($$select public.replace_weekly_hours('a1000000-0000-4000-8000-000000000001',
  '[{"weekday":1,"start_time":"12:00","end_time":"09:00"}]')$$, '23514', null, 'a block must end after it starts');
reset role;
select is((select count(*)::int from public.availability_rules where attorney_id = 'a1000000-0000-4000-8000-000000000001'), 2,
  'a failed save keeps the old hours');

select pg_temp.sign_in('b0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.replace_weekly_hours('a1000000-0000-4000-8000-000000000001',
  '[{"weekday":3,"start_time":"09:00","end_time":"10:00"}]')$$, '42501', null,
  'another firm''s admin cannot change these hours');
reset role;
select is((select count(*)::int from public.availability_rules where attorney_id = 'a1000000-0000-4000-8000-000000000001'), 2,
  'and nothing changed');

set local role anon;
select throws_ok($$select public.replace_weekly_hours('a1000000-0000-4000-8000-000000000001', '[]')$$, '42501', null,
  'anon cannot call replace_weekly_hours');
reset role;

-- ---------------------------------------------------------------------------
-- Reassigning
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-000000000003');
select throws_ok($$update public.appointments set attorney_id = 'a1000000-0000-4000-8000-000000000002'
  where id = 'a2000000-0000-4000-8000-000000000001'$$, '42501', null, 'an attorney cannot hand a booking to a colleague');
reset role;

select pg_temp.sign_in('a0000000-0000-4000-8000-000000000001');
update public.appointments set attorney_id = 'a1000000-0000-4000-8000-000000000002'
  where id = 'a2000000-0000-4000-8000-000000000001';
reset role;
select is((select attorney_id from public.appointments where id = 'a2000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000002'::uuid, 'a partner can reassign a booking');

select * from finish();
rollback;
