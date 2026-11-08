-- Payment connections hold webhook signing secrets: no browser role may read or change them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values ('a0000000-0000-4000-8000-000000000001', 'admin@a.test');
insert into public.firms (id, slug, name, status) values
  ('f0000000-0000-4000-8000-00000000000a', 'firm-a', 'Firm A', 'active'),
  ('f0000000-0000-4000-8000-00000000000b', 'firm-b', 'Firm B', 'active');
insert into public.firm_memberships (profile_id, firm_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000a', 'admin');
insert into public.firm_payment_accounts (firm_id, account_id, status, livemode, webhook_id, webhook_secret) values
  ('f0000000-0000-4000-8000-00000000000a', 'org_firma', 'active', false, 'hook_a', 'whsk_secret_a');

select ok(public.firm_accepts_payments('f0000000-0000-4000-8000-00000000000a'), 'a connected firm accepts payments');
select ok(not public.firm_accepts_payments('f0000000-0000-4000-8000-00000000000b'), 'an unconnected firm does not');

select throws_ok($$
  insert into public.firm_payment_accounts (firm_id, status, livemode) values ('f0000000-0000-4000-8000-00000000000b', 'active', false)
$$, '23514', null, 'a connection cannot be active without an account and webhook');
select throws_ok($$
  insert into public.payments (firm_id, amount_centavos, refunded_centavos) values ('f0000000-0000-4000-8000-00000000000a', 100, 200)
$$, '23514', null, 'a refund cannot exceed the payment');

set local role anon;
select throws_ok($$select webhook_secret from public.firm_payment_accounts$$, '42501', null, 'anon cannot read payment connections');
select throws_ok($$select public.firm_accepts_payments('f0000000-0000-4000-8000-00000000000a')$$, '42501', null,
  'anon cannot call firm_accepts_payments');
reset role;

-- Even the firm's own MFA-verified admin goes through server code, never the table.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$select webhook_secret from public.firm_payment_accounts$$, '42501', null,
  'a firm admin cannot read the webhook secret');
select throws_ok($$update public.firm_payment_accounts set status = 'disabled'$$, '42501', null,
  'a firm admin cannot change the connection directly');
reset role;

select * from finish();
rollback;
