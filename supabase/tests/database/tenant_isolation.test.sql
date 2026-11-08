-- Proves one firm can't read or change another firm's data, in tables and in storage.
-- Run with `npm run db:test`. Everything rolls back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema rls_test;
grant usage on schema rls_test to anon, authenticated;

-- Tables that are never public. The directory tables are checked separately.
create function rls_test.private_rows_of(p_firm uuid) returns text[]
language plpgsql as $$
declare
  v_table text;
  v_count bigint;
  v_found text[] := '{}';
begin
  foreach v_table in array array[
    'appointments', 'intakes', 'conflict_parties', 'conflict_hits', 'documents', 'agreements',
    'invoices', 'payments', 'message_threads', 'notification_log', 'audit_log', 'firm_memberships'
  ] loop
    execute format('select count(*) from public.%I where firm_id = $1', v_table) into v_count using p_firm;
    if v_count > 0 then v_found := v_found || v_table; end if;
  end loop;
  return v_found;
end;
$$;

-- Rows changed by a statement, or -1 if the database refused it.
create function rls_test.run(p_sql text) returns integer
language plpgsql as $$
declare v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
exception when insufficient_privilege then
  return -1;
end;
$$;

-- Become a signed-in user. Later calls switch directly to another user.
create function rls_test.sign_in(p_user uuid, p_aal text default 'aal2') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function rls_test.sign_out() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture: firms A and B. "both" is a client of both firms.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@a.test'),
  ('a0000000-0000-4000-8000-000000000002', 'partner@a.test'),
  ('a0000000-0000-4000-8000-000000000003', 'attorney1@a.test'),
  ('a0000000-0000-4000-8000-000000000004', 'attorney2@a.test'),
  ('b0000000-0000-4000-8000-000000000001', 'admin@b.test'),
  ('b0000000-0000-4000-8000-000000000003', 'attorney1@b.test'),
  ('c0000000-0000-4000-8000-00000000000a', 'client-a@test.test'),
  ('c0000000-0000-4000-8000-00000000000b', 'client-b@test.test'),
  ('c0000000-0000-4000-8000-0000000000ab', 'client-both@test.test');

insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active'),
  ('f0000000-0000-4000-8000-00000000000b', 'firm-b', 'Firm B', 'active'),
  ('f0000000-0000-4000-8000-00000000000c', 'firm-pending', 'Firm Pending', 'pending');

insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'admin'),
  ('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', 'partner'),
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000a', 'attorney'),
  ('a0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-00000000000a', 'attorney'),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'admin'),
  ('b0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000b', 'attorney');

-- The same slugs and names in both firms: uniqueness is per firm.
insert into public.offices (id, firm_id, name) values
  ('0a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'Main Office'),
  ('0b000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'Main Office');

insert into public.consult_types (id, firm_id, slug, label, mode, duration_minutes) values
  ('1a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'video', 'Video', 'video', 30),
  ('1b000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'video', 'Video', 'video', 30);

insert into public.attorneys (id, firm_id, profile_id, slug, full_name, is_active) values
  ('2a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000003', 'sam-cruz', 'Sam Cruz', true),
  ('2a000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000004', 'lee-tan', 'Lee Tan', true),
  ('2b000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000003', 'sam-cruz', 'Sam Cruz', true),
  ('2b000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000b', null, 'retired', 'Retired Attorney', false);

insert into public.appointments (id, firm_id, attorney_id, client_id, consult_type_id, starts_at, ends_at) values
  ('3a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-00000000000a', '1a000000-0000-4000-8000-000000000001', '2030-01-01 01:00+00', '2030-01-01 02:00+00'),
  ('3a000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-0000000000ab', '1a000000-0000-4000-8000-000000000001', '2030-01-01 01:00+00', '2030-01-01 02:00+00'),
  ('3b000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', '2b000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-00000000000b', '1b000000-0000-4000-8000-000000000001', '2030-01-01 01:00+00', '2030-01-01 02:00+00'),
  ('3b000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000b', '2b000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-0000000000ab', '1b000000-0000-4000-8000-000000000001', '2030-01-01 03:00+00', '2030-01-01 04:00+00');

insert into public.intakes (firm_id, appointment_id, first_name, last_name, email, phone, case_type, details, privacy_consent_at) values
  ('f0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000001', 'A', 'Client', 'client-a@test.test', '639000000000', 'Family', 'secret a', now()),
  ('f0000000-0000-4000-8000-00000000000b', '3b000000-0000-4000-8000-000000000001', 'B', 'Client', 'client-b@test.test', '639000000000', 'Family', 'secret b', now());

insert into public.conflict_parties (id, firm_id, name, matter) values
  ('4a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'Party A', 'Matter A'),
  ('4b000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'Party B', 'Matter B');

insert into public.conflict_hits (firm_id, appointment_id, conflict_party_id, matched_name, similarity) values
  ('f0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', 'Party A', 1),
  ('f0000000-0000-4000-8000-00000000000b', '3b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', 'Party B', 1);

-- client-both has one document at each firm.
insert into public.documents (firm_id, owner_id, appointment_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values
  ('f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-0000000000ab', '3a000000-0000-4000-8000-000000000002',
   'f0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000ab/1-a.pdf', 'a.pdf', 'application/pdf', 1, 'c0000000-0000-4000-8000-0000000000ab'),
  ('f0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-0000000000ab', '3b000000-0000-4000-8000-000000000002',
   'f0000000-0000-4000-8000-00000000000b/c0000000-0000-4000-8000-0000000000ab/1-b.pdf', 'b.pdf', 'application/pdf', 1, 'c0000000-0000-4000-8000-0000000000ab');

insert into public.agreements (firm_id, appointment_id, version, body_sha256, signature_name) values
  ('f0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000001', '1', 'x', 'A Client'),
  ('f0000000-0000-4000-8000-00000000000b', '3b000000-0000-4000-8000-000000000001', '1', 'x', 'B Client');

insert into public.invoices (firm_id, client_id, appointment_id, description, amount_centavos) values
  ('f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000001', 'Consult', 100),
  ('f0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '3b000000-0000-4000-8000-000000000001', 'Consult', 100);

insert into public.payments (firm_id, client_id, appointment_id, amount_centavos) values
  ('f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000001', 100),
  ('f0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '3b000000-0000-4000-8000-000000000001', 100);

insert into public.message_threads (id, firm_id, client_id, attorney_id) values
  ('5a000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001'),
  ('5b000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '2b000000-0000-4000-8000-000000000001');

insert into public.messages (thread_id, sender_id, body) values
  ('5a000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'hello a'),
  ('5b000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000b', 'hello b');

insert into public.notification_log (firm_id, channel, template, recipient, appointment_id) values
  ('f0000000-0000-4000-8000-00000000000a', 'email', 'confirm', 'client-a@test.test', '3a000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-00000000000b', 'email', 'confirm', 'client-b@test.test', '3b000000-0000-4000-8000-000000000001');

insert into public.audit_log (firm_id, action, entity) values
  ('f0000000-0000-4000-8000-00000000000a', 'test', 'firm'),
  ('f0000000-0000-4000-8000-00000000000b', 'test', 'firm');

insert into storage.objects (bucket_id, name) values
  ('client-documents', 'f0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000ab/1-a.pdf'),
  ('client-documents', 'f0000000-0000-4000-8000-00000000000b/c0000000-0000-4000-8000-0000000000ab/1-b.pdf'),
  ('avatars', 'c0000000-0000-4000-8000-00000000000a/me.png'),
  ('avatars', 'c0000000-0000-4000-8000-00000000000b/me.png');

-- ---------------------------------------------------------------------------
-- The database itself rejects rows that mix firms, even for the service role and owner
-- ---------------------------------------------------------------------------
select throws_ok($$
  insert into public.appointments (firm_id, attorney_id, consult_type_id, starts_at, ends_at) values
    ('f0000000-0000-4000-8000-00000000000a', '2b000000-0000-4000-8000-000000000001',
     '1a000000-0000-4000-8000-000000000001', '2031-01-01 01:00+00', '2031-01-01 02:00+00')
$$, '23503', null, 'an appointment cannot use another firm''s attorney');

select throws_ok($$
  insert into public.appointments (firm_id, attorney_id, consult_type_id, starts_at, ends_at) values
    ('f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
     '1b000000-0000-4000-8000-000000000001', '2031-01-01 01:00+00', '2031-01-01 02:00+00')
$$, '23503', null, 'an appointment cannot use another firm''s consult type');

select throws_ok($$
  insert into public.conflict_hits (firm_id, appointment_id, conflict_party_id, matched_name, similarity) values
    ('f0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000002',
     '4b000000-0000-4000-8000-000000000001', 'Party B', 1)
$$, '23503', null, 'a conflict hit cannot match another firm''s party');

select throws_ok($$
  update public.attorneys set profile_id = 'b0000000-0000-4000-8000-000000000001'
  where id = '2a000000-0000-4000-8000-000000000001'
$$, '23503', null, 'an attorney cannot be linked to a member of another firm');

select throws_ok($$
  insert into public.firm_memberships (profile_id, firm_id, role) values
    ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', 'admin')
$$, '23505', null, 'a staff member belongs to only one firm');

select throws_ok($$
  insert into public.attorneys (firm_id, slug, full_name) values
    ('f0000000-0000-4000-8000-00000000000a', 'sam-cruz', 'Duplicate')
$$, '23505', null, 'attorney slugs are unique within a firm');

select throws_ok($$
  insert into public.documents (firm_id, owner_id, storage_path, file_name, mime_type, size_bytes) values
    ('f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', 'wrong/path.pdf', 'x.pdf', 'application/pdf', 1)
$$, '23514', null, 'a document path must start with its firm and owner');

select throws_ok($$
  insert into public.appointments (firm_id, attorney_id, consult_type_id, starts_at, ends_at) values
    ('f0000000-0000-4000-8000-00000000000a', '2a000000-0000-4000-8000-000000000001',
     '1a000000-0000-4000-8000-000000000001', '2030-01-01 01:30+00', '2030-01-01 02:30+00')
$$, '23P01', null, 'double booking is still rejected');

-- ---------------------------------------------------------------------------
-- Firm A's staff see nothing private from firm B, at any role
-- ---------------------------------------------------------------------------
select rls_test.sign_in('a0000000-0000-4000-8000-000000000001');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000b'), '{}', 'A admin sees nothing private of B');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000a'),
  array['appointments', 'intakes', 'conflict_parties', 'conflict_hits', 'documents', 'agreements',
        'invoices', 'payments', 'message_threads', 'notification_log', 'audit_log', 'firm_memberships'],
  'A admin sees every private table of A');
select is((select count(*)::int from public.messages), 1, 'A admin sees only A messages');
select is((select count(*)::int from public.documents), 1, 'A admin sees only the document held at A');
select is((select count(*)::int from public.profiles where email like '%@b.test'), 0, 'A admin cannot read B staff profiles');
select is((select count(*)::int from public.profiles where email = 'client-b@test.test'), 0, 'A admin cannot read B client profiles');
select is((select count(*)::int from public.profiles where email = 'client-both@test.test'), 1, 'A admin can read a client of A');
select is((select count(*)::int from public.profiles where email like '%@a.test'), 4, 'A admin can read colleagues');
select is((select count(*)::int from storage.objects where bucket_id = 'client-documents'), 1, 'A admin sees only A storage objects');
select is((select name from storage.objects where bucket_id = 'client-documents'),
  'f0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000ab/1-a.pdf', 'and it is the A object');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 1, 'A admin sees only avatars of A people');

select rls_test.sign_in('a0000000-0000-4000-8000-000000000002');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000b'), '{}', 'A partner sees nothing private of B');

select rls_test.sign_in('a0000000-0000-4000-8000-000000000003');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000b'), '{}', 'A attorney sees nothing private of B');
select is((select count(*)::int from public.appointments), 1, 'attorneys see only their own appointments');
select is((select count(*)::int from public.invoices), 0, 'attorneys cannot see invoices');
select is((select count(*)::int from public.conflict_parties), 1, 'attorneys can run conflict checks within their firm');

select rls_test.sign_in('b0000000-0000-4000-8000-000000000001');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000a'), '{}', 'B admin sees nothing private of A');
select is((select file_name from public.documents), 'b.pdf', 'B admin sees only the shared client''s B document');

-- The regression this phase exists for: sharing a client must not expose the other firm's files.
select rls_test.sign_in('b0000000-0000-4000-8000-000000000003');
select is((select file_name from public.documents), 'b.pdf', 'B attorney sees only the shared client''s B document');
select is((select count(*)::int from storage.objects where bucket_id = 'client-documents'), 1, 'B attorney sees one storage object');
select is((select name from storage.objects where bucket_id = 'client-documents'),
  'f0000000-0000-4000-8000-00000000000b/c0000000-0000-4000-8000-0000000000ab/1-b.pdf', 'and it is the B object');

-- ---------------------------------------------------------------------------
-- Without MFA, staff have no staff access at all
-- ---------------------------------------------------------------------------
select rls_test.sign_in('a0000000-0000-4000-8000-000000000001', 'aal1');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000a'), array['firm_memberships'], 'admin without MFA sees only their own membership');
select is((select count(*)::int from public.firm_memberships), 1, 'and only their own row');
select is(public.current_firm_id(), null, 'current_firm_id is null without MFA');

-- ---------------------------------------------------------------------------
-- Clients see only their own rows, across every firm they use
-- ---------------------------------------------------------------------------
select rls_test.sign_in('c0000000-0000-4000-8000-00000000000a', 'aal1');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000b'), '{}', 'client of A sees nothing private of B');
select is((select count(*)::int from public.appointments), 1, 'client sees only their own appointment');
select is((select count(*)::int from public.conflict_parties), 0, 'client cannot see conflict parties');
select is((select count(*)::int from public.conflict_hits), 0, 'client cannot see conflict hits');
select is((select count(*)::int from public.firm_memberships), 0, 'client cannot see memberships');
select is((select count(*)::int from public.messages), 1, 'client sees only their own messages');

select rls_test.sign_in('c0000000-0000-4000-8000-0000000000ab', 'aal1');
select is((select count(*)::int from public.appointments), 2, 'a client of both firms sees both appointments');
select is((select count(*)::int from public.documents), 2, 'and both of their documents');

-- ---------------------------------------------------------------------------
-- Directory: public only for active firms
-- ---------------------------------------------------------------------------
select rls_test.sign_out();
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000a'), '{}', 'anon sees nothing private of A');
select is(rls_test.private_rows_of('f0000000-0000-4000-8000-00000000000b'), '{}', 'anon sees nothing private of B');
select is((select count(*)::int from public.firms where slug in ('firm-a', 'firm-b')), 2, 'anon sees active firms');
select is((select count(*)::int from public.firms where slug = 'firm-pending'), 0, 'anon cannot see a pending firm');
select is((select count(*)::int from public.attorneys where slug = 'sam-cruz'), 2, 'anon sees active attorneys of active firms');
select is((select count(*)::int from public.attorneys where slug = 'retired'), 0, 'anon cannot see inactive attorneys');

select rls_test.sign_in('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.attorneys where slug = 'retired'), 0, 'A admin cannot see B''s inactive attorneys');

-- ---------------------------------------------------------------------------
-- Writes: nothing reaches another firm
-- ---------------------------------------------------------------------------
select is(rls_test.run($$update public.appointments set cancel_reason = 'x' where firm_id = 'f0000000-0000-4000-8000-00000000000b'$$), 0, 'A admin cannot update B appointments');
select is(rls_test.run($$update public.appointments set cancel_reason = 'x' where id = '3a000000-0000-4000-8000-000000000001'$$), 1, 'A admin can update A appointments');
select is(rls_test.run($$update public.appointments set firm_id = 'f0000000-0000-4000-8000-00000000000b' where id = '3a000000-0000-4000-8000-000000000001'$$), -1, 'A admin cannot move an appointment to B');
select is(rls_test.run($$update public.attorneys set bio = 'x' where firm_id = 'f0000000-0000-4000-8000-00000000000b'$$), 0, 'A admin cannot update B attorneys');
select is(rls_test.run($$delete from public.offices where firm_id = 'f0000000-0000-4000-8000-00000000000b'$$), 0, 'A admin cannot delete B offices');
select is(rls_test.run($$delete from public.conflict_parties where firm_id = 'f0000000-0000-4000-8000-00000000000b'$$), 0, 'A admin cannot delete B conflict parties');
select is(rls_test.run($$insert into public.attorneys (firm_id, slug, full_name) values ('f0000000-0000-4000-8000-00000000000b', 'planted', 'Planted')$$), -1, 'A admin cannot add an attorney to B');
select is(rls_test.run($$insert into public.conflict_parties (firm_id, name, matter) values ('f0000000-0000-4000-8000-00000000000b', 'x', 'x')$$), -1, 'A admin cannot add a conflict party to B');
select is(rls_test.run($$insert into public.availability_rules (attorney_id, weekday, start_time, end_time) values ('2b000000-0000-4000-8000-000000000001', 1, '09:00', '10:00')$$), -1, 'A admin cannot change a B attorney''s schedule');
select is(rls_test.run($$insert into public.messages (thread_id, sender_id, body) values ('5b000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'x')$$), -1, 'A admin cannot post in a B thread');
select is(rls_test.run($$insert into public.firm_memberships (profile_id, firm_id, role) values ('c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000a', 'admin')$$), -1, 'memberships cannot be added through the API');
select is(rls_test.run($$update public.firm_memberships set role = 'admin' where profile_id = 'a0000000-0000-4000-8000-000000000003'$$), 0, 'memberships cannot be changed through the API');
select is(rls_test.run($$update public.firms set status = 'active' where slug = 'firm-pending'$$), 0, 'firm status cannot be changed through the API');
select is(rls_test.run($$insert into storage.objects (bucket_id, name) values ('attorney-photos', 'f0000000-0000-4000-8000-00000000000b/2b000000-0000-4000-8000-000000000001/x.png')$$), -1, 'A admin cannot upload a photo to B''s folder');
select is(rls_test.run($$insert into storage.objects (bucket_id, name) values ('attorney-photos', 'f0000000-0000-4000-8000-00000000000a/2a000000-0000-4000-8000-000000000001/x.png')$$), 1, 'A admin can upload a photo to A''s folder');

select rls_test.sign_in('a0000000-0000-4000-8000-000000000003');
select is(rls_test.run($$update public.availability_rules set weekday = 2 where attorney_id = '2b000000-0000-4000-8000-000000000001'$$), 0, 'A attorney cannot change a B attorney''s schedule');
select is(rls_test.run($$insert into public.availability_rules (attorney_id, weekday, start_time, end_time) values ('2a000000-0000-4000-8000-000000000001', 1, '09:00', '10:00')$$), 1, 'A attorney can change their own schedule');
select is(rls_test.run($$insert into public.availability_rules (attorney_id, weekday, start_time, end_time) values ('2a000000-0000-4000-8000-000000000002', 1, '09:00', '10:00')$$), -1, 'A attorney cannot change a colleague''s schedule');

-- Clients may only upload to firms they have an appointment with, under their own folder.
select rls_test.sign_in('c0000000-0000-4000-8000-00000000000a', 'aal1');
select is(rls_test.run($$insert into storage.objects (bucket_id, name) values ('client-documents', 'f0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-00000000000a/ok.pdf')$$), 1, 'client can upload to their own firm');
select is(rls_test.run($$insert into storage.objects (bucket_id, name) values ('client-documents', 'f0000000-0000-4000-8000-00000000000b/c0000000-0000-4000-8000-00000000000a/no.pdf')$$), -1, 'client cannot upload to a firm they don''t use');
select is(rls_test.run($$insert into storage.objects (bucket_id, name) values ('client-documents', 'f0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-00000000000b/no.pdf')$$), -1, 'client cannot upload into another client''s folder');
select is(rls_test.run($$insert into public.documents (firm_id, owner_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('f0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000b/c0000000-0000-4000-8000-00000000000a/x.pdf', 'x.pdf', 'application/pdf', 1, 'c0000000-0000-4000-8000-00000000000a')$$), -1, 'client cannot add a document at a firm they don''t use');
select is(rls_test.run($$insert into public.documents (firm_id, owner_id, appointment_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values ('f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '3a000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-00000000000a/y.pdf', 'y.pdf', 'application/pdf', 1, 'c0000000-0000-4000-8000-00000000000a')$$), -1, 'client cannot attach a document to another client''s appointment');

select set_config('role', 'postgres', true);
select * from finish();
rollback;
