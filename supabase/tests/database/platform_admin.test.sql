-- Platform admin: attorney checks, firm review actions, comps, and who may do them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'op@platform.test'),
  ('a0000000-0000-4000-8000-000000000002', 'manager@new.test'),
  ('a0000000-0000-4000-8000-000000000003', 'manager@live.test');
insert into public.platform_admins (profile_id) values ('a0000000-0000-4000-8000-000000000001');
insert into public.firms (id, slug, name, status, contact_email) values
  ('f0000000-0000-4000-8000-000000000001', 'new-firm', 'New Firm', 'pending', 'hi@new.test'),
  ('f0000000-0000-4000-8000-000000000002', 'live-firm', 'Live Firm', 'active', 'hi@live.test');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'admin'),
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', 'admin');
insert into public.consult_types (firm_id, slug, label, mode, duration_minutes) values
  ('f0000000-0000-4000-8000-000000000001', 'call', 'Call', 'phone', 15),
  ('f0000000-0000-4000-8000-000000000002', 'call', 'Call', 'phone', 15);
-- As a direct database session (an operator), the live firm's attorney can be marked checked.
insert into public.attorneys (id, firm_id, slug, full_name, ibp_roll_no, admitted_year, ibp_checked_at) values
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'nina', 'Nina New', '54321', 2012, null),
  ('b0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'larry', 'Larry Live', '11111', 2001, now()),
  ('b0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'norm', 'No Roll', null, null, null);
insert into public.availability_rules (attorney_id, weekday, start_time, end_time) values
  ('b0000000-0000-4000-8000-000000000001', 1, '09:00', '17:00'),
  ('b0000000-0000-4000-8000-000000000002', 1, '09:00', '17:00');

-- ---------------------------------------------------------------------------
-- Firm managers can't check their own attorneys
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
insert into public.attorneys (firm_id, slug, full_name, ibp_roll_no, admitted_year, ibp_checked_at)
values ('f0000000-0000-4000-8000-000000000002', 'newbie', 'Newbie', '22222', 2020, now());
select ok((select ibp_checked_at is null from public.attorneys where slug = 'newbie'), 'a manager''s new attorney starts unchecked');
update public.attorneys set ibp_checked_at = now() where slug = 'newbie';
select ok((select ibp_checked_at is null from public.attorneys where slug = 'newbie'), 'and a manager cannot mark it checked');
update public.attorneys set bio = 'Updated bio' where id = 'b0000000-0000-4000-8000-000000000002';
select ok((select ibp_checked_at is not null from public.attorneys where id = 'b0000000-0000-4000-8000-000000000002'),
  'editing other details keeps the check');
update public.attorneys set ibp_roll_no = '11112' where id = 'b0000000-0000-4000-8000-000000000002';
select ok((select ibp_checked_at is null from public.attorneys where id = 'b0000000-0000-4000-8000-000000000002'),
  'changing the roll number clears the check');
select is(public.is_platform_admin(), false, 'a firm manager is not an operator');
select is(public.admin_set_attorney_check('b0000000-0000-4000-8000-000000000002', true), 'forbidden', 'nor can they call the operator functions');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'approve'), 'forbidden', 'or approve a firm');
select is(public.admin_set_comp('f0000000-0000-4000-8000-000000000002', true), 'forbidden', 'or comp one');
select throws_ok($$ select * from public.firm_platform $$, '42501', null, 'the platform record is not readable by firms');

-- ---------------------------------------------------------------------------
-- Visitors see only checked attorneys
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*) from public.attorneys where firm_id = 'f0000000-0000-4000-8000-000000000002'), 0::bigint,
  'a live firm''s unchecked attorneys are hidden from visitors');

-- ---------------------------------------------------------------------------
-- An operator needs two-factor
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(public.is_platform_admin(), false, 'an operator without two-factor is not trusted');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'approve'), 'forbidden', 'and cannot act');

set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is(public.is_platform_admin(), true, 'an operator with two-factor is trusted');

-- ---------------------------------------------------------------------------
-- Checking attorneys
-- ---------------------------------------------------------------------------
select is(public.admin_set_attorney_check('b0000000-0000-4000-8000-000000000003', true), 'incomplete', 'an attorney without a roll number cannot be checked');
select is(public.admin_set_attorney_check('b0000000-0000-4000-8000-0000000000ff', true), 'missing', 'an unknown attorney is reported');
select is(public.admin_set_attorney_check('b0000000-0000-4000-8000-000000000002', true), 'ok', 'an operator checks an attorney');
reset role;
select ok((select ibp_checked_by = 'a0000000-0000-4000-8000-000000000001' from public.attorneys where id = 'b0000000-0000-4000-8000-000000000002'),
  'the check records who made it');
select is((select details->>'roll_no' from public.audit_log where action = 'platform.attorney_checked' and entity_id = 'b0000000-0000-4000-8000-000000000002'), '11112', 'the check is audited with what was checked');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Reviewing a pending firm
-- ---------------------------------------------------------------------------
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'approve'), 'no_checked_attorney',
  'a firm cannot go live before one of its attorneys is checked');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'send_back', '  '), 'note_required', 'sending back needs a note');
update public.firms set review_requested_at = now() where id = 'f0000000-0000-4000-8000-000000000001';
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'send_back', 'The roll number does not match the name.'), 'ok',
  'an operator sends a firm back');
reset role;
select ok((select review_requested_at is null and status = 'pending' from public.firms where id = 'f0000000-0000-4000-8000-000000000001'),
  'which can then ask again');
select is((select firm_note from public.firm_platform where firm_id = 'f0000000-0000-4000-8000-000000000001'),
  'The roll number does not match the name.', 'and is told why');
set local role authenticated;

select is(public.admin_set_attorney_check('b0000000-0000-4000-8000-000000000001', true), 'ok', 'the firm''s attorney is checked');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'approve'), 'ok', 'and the firm is approved');
reset role;
select is((select status::text from public.firms where id = 'f0000000-0000-4000-8000-000000000001'), 'active', 'its page is live');
select ok((select approved_at is not null and firm_note is null from public.firm_platform where firm_id = 'f0000000-0000-4000-8000-000000000001'),
  'approval is recorded and the old note cleared');
set local role authenticated;
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'approve'), 'wrong_status', 'a live firm cannot be approved again');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'reinstate'), 'wrong_status', 'or reinstated');

-- ---------------------------------------------------------------------------
-- Suspending and reinstating
-- ---------------------------------------------------------------------------
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'suspend'), 'note_required', 'suspending needs a reason');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'suspend', 'Reported misuse.'), 'ok', 'an operator suspends a firm');
reset role;
select is((select status::text from public.firms where id = 'f0000000-0000-4000-8000-000000000001'), 'suspended', 'its page goes offline');
set local role authenticated;
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000001', 'reinstate'), 'ok', 'and reinstates it');
reset role;
select is((select status::text from public.firms where id = 'f0000000-0000-4000-8000-000000000001'), 'active', 'an approved firm goes back live');

insert into public.firms (id, slug, name, status) values ('f0000000-0000-4000-8000-000000000003', 'spam-firm', 'Spam', 'pending');
set local role authenticated;
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000003', 'suspend', 'Not a law firm.'), 'ok', 'a pending firm can be suspended');
select is(public.admin_firm_action('f0000000-0000-4000-8000-000000000003', 'reinstate'), 'ok', 'and reinstated');
reset role;
select is((select status::text from public.firms where id = 'f0000000-0000-4000-8000-000000000003'), 'pending',
  'a firm never approved goes back to waiting for review');
set local role authenticated;
select throws_ok($$ select public.admin_firm_action('f0000000-0000-4000-8000-000000000003', 'delete') $$, '22023', null, 'unknown actions are refused');
reset role;

select is((select array_agg(action order by id)::text from public.audit_log where entity = 'firms' and action like 'platform.firm_%' and firm_id::text like 'f0000000-0000-4000-8000-00000000000_'),
  '{platform.firm_sent_back,platform.firm_approved,platform.firm_suspended,platform.firm_reinstated,platform.firm_suspended,platform.firm_reinstated}',
  'every firm action is audited');
select ok((select bool_and(actor_id = 'a0000000-0000-4000-8000-000000000001') from public.audit_log where action like 'platform.%' and firm_id::text like 'f0000000-0000-4000-8000-00000000000_'),
  'by the operator who did it');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Comps
-- ---------------------------------------------------------------------------
select is(public.admin_set_comp('f0000000-0000-4000-8000-000000000002', true, '2020-01-01', null), 'past_date', 'a comp cannot end in the past');
select is(public.admin_set_comp('f0000000-0000-4000-8000-000000000002', true, '2099-06-30', 'Early firm'), 'ok', 'an operator comps a firm');
reset role;
select is((select comped::text || ' ' || comped_until || ' ' || comp_note from public.firm_platform where firm_id = 'f0000000-0000-4000-8000-000000000002'),
  'true 2099-06-30 Early firm', 'with an end date and a note');
set local role authenticated;
select is(public.admin_set_comp('f0000000-0000-4000-8000-000000000002', false), 'ok', 'and ends it');
reset role;
select ok((select not comped and comped_until is null from public.firm_platform where firm_id = 'f0000000-0000-4000-8000-000000000002'), 'ending clears the date');
select is((select count(*) from public.audit_log where action in ('platform.comp_set', 'platform.comp_ended') and firm_id = 'f0000000-0000-4000-8000-000000000002'), 2::bigint, 'comps are audited');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- The setup checklist is visible to operators
-- ---------------------------------------------------------------------------
select is((select row(attorney_ready, consult_ready, hours_ready, contact_ready)::text
             from public.firm_setup_status('f0000000-0000-4000-8000-000000000002')),
  '(t,t,t,t)', 'an operator can read any firm''s setup checklist');

select * from finish();
rollback;
