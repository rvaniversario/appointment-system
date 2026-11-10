-- Firm signup: email codes, creating the firm, the setup checklist and asking to go live.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'atty@new.test'),
  ('a0000000-0000-4000-8000-000000000002', 'office@new.test'),
  ('a0000000-0000-4000-8000-000000000003', 'staff@existing.test'),
  ('a0000000-0000-4000-8000-000000000004', 'junior@new.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-0000000000e1', 'existing-firm', 'Existing Firm', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-0000000000e1', 'admin');

-- ---------------------------------------------------------------------------
-- Email codes
-- ---------------------------------------------------------------------------
insert into public.signup_email_codes (email, code_hash, expires_at) values
  ('atty@new.test', repeat('a', 64), now() + interval '10 minutes'),
  ('slow@new.test', repeat('a', 64), now() - interval '1 minute'),
  ('guess@new.test', repeat('a', 64), now() + interval '10 minutes');
select throws_ok($$ insert into public.signup_email_codes (email, code_hash, expires_at) values ('Upper@New.test', repeat('a', 64), now()) $$,
  '23514', null, 'emails are stored lower-case');
select is(public.verify_signup_email_code('nobody@new.test', repeat('a', 64)), 'missing', 'no code was sent to that address');
select is(public.verify_signup_email_code('atty@new.test', repeat('b', 64)), 'wrong', 'a wrong code is rejected');
select is(public.verify_signup_email_code('atty@new.test', repeat('a', 64)), 'ok', 'the right code is accepted');
select is(public.verify_signup_email_code('atty@new.test', repeat('a', 64)), 'ok', 'a verified code still works while the form is finished');
select is(public.verify_signup_email_code('atty@new.test', repeat('b', 64)), 'expired', 'but only the same code');
update public.signup_email_codes set verified_at = now() - interval '31 minutes' where email = 'atty@new.test';
select is(public.verify_signup_email_code('atty@new.test', repeat('a', 64)), 'expired', 'a verified code lapses after 30 minutes');
select is(public.verify_signup_email_code('slow@new.test', repeat('a', 64)), 'expired', 'an expired code is rejected');
select public.verify_signup_email_code('guess@new.test', repeat('b', 64)) from generate_series(1, 5);
select is(public.verify_signup_email_code('guess@new.test', repeat('a', 64)), 'locked', 'after five wrong guesses even the right code is refused');

-- ---------------------------------------------------------------------------
-- Creating the firm
-- ---------------------------------------------------------------------------
select lives_ok($$
  select public.create_signup_firm('a0000000-0000-4000-8000-000000000001', 'Santos Law', 'santos-law',
    'Ana Santos', 'ana-santos', '65432', 2015::smallint, true)
$$, 'an attorney can sign up a firm');
select is((select status::text from public.firms where slug = 'santos-law'), 'pending', 'a new firm starts pending');
select is((select created_by from public.firms where slug = 'santos-law'), 'a0000000-0000-4000-8000-000000000001'::uuid, 'the firm records who signed it up');
select is((select contact_email from public.firms where slug = 'santos-law'), 'atty@new.test', 'the signer''s email is the first contact email');
select is((select role::text from public.firm_memberships where profile_id = 'a0000000-0000-4000-8000-000000000001'), 'admin', 'the signer is the firm''s admin');
select is((select profile_id from public.attorneys where slug = 'ana-santos'), 'a0000000-0000-4000-8000-000000000001'::uuid,
  'an attorney signer is linked to their attorney profile');
select is((select ibp_roll_no || ' ' || admitted_year from public.attorneys where slug = 'ana-santos'), '65432 2015', 'the roll number and year are kept');
select is((select count(*) from public.audit_log where action = 'firm.signed_up'), 1::bigint, 'the signup is audited');

select lives_ok($$
  select public.create_signup_firm('a0000000-0000-4000-8000-000000000002', 'Cruz Office', 'cruz-office',
    'Ben Cruz', 'ben-cruz', '12345', 2001::smallint, false)
$$, 'an office manager can sign up a firm');
select ok((select profile_id is null from public.attorneys where slug = 'ben-cruz'), 'an office manager is not linked to the attorney');
select throws_ok($$
  select public.create_signup_firm('a0000000-0000-4000-8000-000000000003', 'Second Firm', 'second-firm', 'X', 'x', '1', 2001::smallint, true)
$$, 'P0001', 'already_staff', 'staff of another firm cannot sign up a second firm');
select throws_ok($$
  select public.create_signup_firm('a0000000-0000-4000-8000-000000000004', 'Copy', 'santos-law', 'X', 'x', '1', 2001::smallint, true)
$$, '23505', null, 'a taken page address is refused');
select ok(not exists (select 1 from public.firm_memberships where profile_id = 'a0000000-0000-4000-8000-000000000004'),
  'a refused signup leaves nothing behind');

-- ---------------------------------------------------------------------------
-- Setup and review, as the new firm's admin
-- ---------------------------------------------------------------------------
insert into public.firm_memberships (profile_id, firm_id, role)
select 'a0000000-0000-4000-8000-000000000004', id, 'attorney' from public.firms where slug = 'santos-law';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select is((select row(attorney_ready, consult_ready, hours_ready, contact_ready)::text
             from public.firm_setup_status((select id from public.firms where slug = 'santos-law'))),
  '(t,f,f,t)', 'a new firm has its attorney and contact email, but no consultations or hours yet');
select is(public.request_firm_review(), 'incomplete', 'a firm cannot ask to go live before setup is done');
select ok((select id from public.firms where slug = 'santos-law') is not null, 'staff can see their own pending firm');
select is_empty($$ select * from public.firm_setup_status('f0000000-0000-4000-8000-0000000000e1') $$, 'nor another firm''s setup');
reset role;

insert into public.consult_types (firm_id, slug, label, mode, duration_minutes)
select id, 'intro', 'Intro', 'phone', 30 from public.firms where slug = 'santos-law';
insert into public.availability_rules (attorney_id, weekday, start_time, end_time)
select id, 1, '09:00', '12:00' from public.attorneys where slug = 'ana-santos';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}';
select is(public.request_firm_review(), 'forbidden', 'an attorney who isn''t a partner or admin cannot ask');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(public.request_firm_review(), 'forbidden', 'asking needs a two-factor session');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select is(public.request_firm_review(), 'requested', 'once setup is done, the admin can ask to go live');
reset role;
select ok((select review_requested_at is not null from public.firms where slug = 'santos-law'), 'the request is recorded');
select is((select status::text from public.firms where slug = 'santos-law'), 'pending', 'asking does not make the page live');
select is((select count(*) from public.audit_log where action = 'firm.review_requested'), 1::bigint, 'the request is audited');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
select is(public.request_firm_review(), 'not_pending', 'a live firm has nothing to ask for');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
update public.firms set status = 'active' where slug = 'santos-law';
reset role;
select is((select status::text from public.firms where slug = 'santos-law'), 'pending', 'staff cannot make their firm live themselves');

-- ---------------------------------------------------------------------------
-- Visitors
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is_empty($$ select * from public.firms where slug = 'santos-law' $$, 'a pending firm is hidden from visitors');
select throws_ok($$ select * from public.signup_email_codes $$, '42501', null, 'visitors cannot read signup codes');
select throws_ok($$ select public.verify_signup_email_code('atty@new.test', repeat('a', 64)) $$, '42501', null, 'visitors cannot check codes');
select throws_ok($$ select public.create_signup_firm('a0000000-0000-4000-8000-000000000004', 'X', 'xx-firm', 'X', 'x', '1', 2001::smallint, true) $$,
  '42501', null, 'visitors cannot create firms directly');
select throws_ok($$ select public.request_firm_review() $$, '42501', null, 'visitors cannot ask for review');
reset role;

select * from finish();
rollback;
