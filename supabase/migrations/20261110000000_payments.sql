-- Consultation fee payments through PayMongo Linked Accounts.
--
-- Each firm's own PayMongo account is linked under the platform's parent account. Payments
-- are created on the firm's behalf (parent secret key + Account-ID header), so they settle
-- to the firm, which stays merchant of record. The platform never holds the funds and takes
-- no share of them.

create table public.firm_payment_accounts (
  firm_id uuid primary key references public.firms (id) on delete cascade,
  provider text not null default 'paymongo' check (provider = 'paymongo'),
  -- The firm's PayMongo account id ("org_…"). Null while an invitation is pending.
  account_id text unique check (account_id is null or account_id ~ '^org_[A-Za-z0-9]+$'),
  invitation_id text,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  livemode boolean not null,
  -- The webhook registered on the firm's account, and its signing secret.
  webhook_id text,
  webhook_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or (account_id is not null and webhook_id is not null and webhook_secret is not null))
);
create trigger firm_payment_accounts_updated_at before update on public.firm_payment_accounts
  for each row execute function public.set_updated_at();

-- Holds the webhook signing secret: no policies, so only the service role can read it.
alter table public.firm_payment_accounts enable row level security;
revoke all on public.firm_payment_accounts from anon, authenticated;

alter table public.payments
  add column account_id text,
  add column refunded_centavos integer not null default 0 check (refunded_centavos >= 0),
  add column provider_refund_id text,
  add column refunded_at timestamptz,
  add column failure_reason text,
  add constraint payments_refund_not_more_than_paid check (refunded_centavos <= amount_centavos);
create index payments_appointment_idx on public.payments (appointment_id);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

-- Can this firm take online payments?
create function public.firm_accepts_payments(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.firm_payment_accounts a where a.firm_id = p_firm and a.status = 'active'
  );
$$;
revoke execute on function public.firm_accepts_payments(uuid) from public, anon, authenticated;
grant execute on function public.firm_accepts_payments(uuid) to service_role;
