-- Firm settings: invites stay with each firm's partners and admins, attorneys edit only the
-- public parts of their own profile, and logos are uploaded only through server code.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'partner@a.test'),
  ('a0000000-0000-4000-8000-000000000003', 'attorney@a.test'),
  ('a0000000-0000-4000-8000-000000000004', 'unlinked@a.test'),
  ('b0000000-0000-4000-8000-000000000001', 'admin@b.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active'),
  ('f0000000-0000-4000-8000-00000000000b', 'firm-b', 'Firm B', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'partner'),
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'attorney'),
  ('a0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-00000000000a', 'attorney'),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'admin');
insert into public.attorneys (id, firm_id, profile_id, slug, full_name, ibp_roll_no) values
  ('a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000003', 'atty', 'Atty A', '12345');
insert into public.staff_invites (firm_id, email, role, token_hash, expires_at) values
  ('f0000000-0000-4000-8000-00000000000a', 'new@a.test', 'attorney', 'hash-a', now() + interval '7 days'),
  ('f0000000-0000-4000-8000-00000000000b', 'new@b.test', 'partner', 'hash-b', now() + interval '7 days');

create function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select throws_ok($$insert into public.staff_invites (firm_id, email, role, token_hash, expires_at)
  values ('f0000000-0000-4000-8000-00000000000a', 'a@a.test', 'admin', 'x', now() - interval '1 day')$$, '23514', null,
  'an invite must expire after it was created');
select throws_ok($$insert into public.staff_invites (firm_id, email, role, token_hash, expires_at)
  values ('f0000000-0000-4000-8000-00000000000a', 'new@a.test', 'admin', 'hash-c', now() + interval '1 day')$$, '23505', null,
  'one open invite per email per firm');

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-000000000001');
select is((select array_agg(email) from public.staff_invites), array['new@a.test'], 'a partner sees only their firm''s invites');
select throws_ok($$insert into public.staff_invites (firm_id, email, role, token_hash, expires_at)
  values ('f0000000-0000-4000-8000-00000000000a', 'x@a.test', 'admin', 'hash-x', now() + interval '1 day')$$, '42501', null,
  'even a partner creates invites only through server code');
reset role;

select pg_temp.sign_in('a0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.staff_invites), 0, 'an attorney sees no invites');
reset role;

set local role anon;
select throws_ok($$select * from public.staff_invites$$, '42501', null, 'anon cannot read invites');
reset role;

-- ---------------------------------------------------------------------------
-- An attorney's own profile
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-000000000003');
select lives_ok($$select public.update_own_attorney_profile('New bio', array['Family Law'], array['English', 'Filipino'], 'https://meet.example/a')$$,
  'an attorney updates their own public details');
select throws_ok($$select public.update_own_attorney_profile('x', '{}', '{}', 'http://insecure.example')$$, '22023', null,
  'meeting links must be https');
update public.attorneys set full_name = 'Renamed', ibp_roll_no = '99999', is_active = false
  where id = 'a1000000-0000-4000-8000-000000000001';
reset role;
select is((select row(bio, practice_areas, meeting_url)::text from public.attorneys where id = 'a1000000-0000-4000-8000-000000000001'),
  row('New bio', array['Family Law'], 'https://meet.example/a')::text, 'the public details were saved');
select is((select row(full_name, ibp_roll_no, is_active)::text from public.attorneys where id = 'a1000000-0000-4000-8000-000000000001'),
  row('Atty A', '12345', true)::text, 'an attorney cannot change their name, IBP number or status directly');

select pg_temp.sign_in('a0000000-0000-4000-8000-000000000004');
select throws_ok($$select public.update_own_attorney_profile('x', '{}', '{}', null)$$, '42501', null,
  'staff without an attorney profile have nothing to edit');
reset role;

select pg_temp.sign_in('b0000000-0000-4000-8000-000000000001');
update public.attorneys set full_name = 'Taken over' where id = 'a1000000-0000-4000-8000-000000000001';
reset role;
select is((select full_name from public.attorneys where id = 'a1000000-0000-4000-8000-000000000001'), 'Atty A',
  'another firm''s admin cannot edit this attorney');

-- ---------------------------------------------------------------------------
-- Logos
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-000000000001');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('firm-logos', 'f0000000-0000-4000-8000-00000000000a/logo.png')$$,
  '42501', null, 'logos are uploaded only through server code');
reset role;

select * from finish();
rollback;
