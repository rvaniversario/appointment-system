# SaaS plan: booking pages for Philippine law firms

Attorneys and firms subscribe, get their own booking page, and bring their own clients. Think
Calendly for law firms. There is no shared marketplace, and clients never browse across firms.

This replaces the single-firm roadmap. Stack and conventions are unchanged: Next.js, Supabase,
PayMongo, Resend, PhilSMS, Vercel, PHP in centavos, Asia/Manila. One PR per phase.

## Decisions

| Topic | Decision |
| --- | --- |
| Customer | A **firm**. A solo attorney is a firm of one. |
| Public URL | `/f/[firmSlug]`, plus `/f/[firmSlug]/attorneys` and `/f/[firmSlug]/book/[attorneyId]/...`. Subdomains and custom domains can come later. |
| Home page (`/`) | Becomes the product landing page for attorneys, with pricing and signup. |
| Staff | Belong to exactly one firm in v1 (`firm_memberships.profile_id` is unique). This keeps `current_firm_id()` simple and can be relaxed later. |
| Clients | One login across firms and one `/portal`, with each item labelled by firm. A firm sees only its own dealings with that client. |
| Our revenue | Flat subscription only, with **no percentage of consultation fees**, because of the rules on sharing fees with non-lawyers. |
| Consultation fees | Go to the firm. We don't hold client funds. |
| Subscription billing | PayMongo Subscriptions on **our own** PayMongo account: credit/debit cards and Maya renew automatically. GCash can only be offered as a manual option (see Phase 8). |
| Lapsed subscription | New bookings stop. Existing appointments, records and data export keep working. |

## Phase 1: Supabase foundation (done)
Schema, RLS, storage buckets, client and staff auth, staff MFA.

## Phase 2: Multi-tenant foundation (done)
The riskiest phase. Nothing else ships on the old security model.

**Schema (new migration, not an edit of the existing ones)**
- `firms`: slug (unique), name, status, branding fields, contact details.
- `firm_memberships`: `profile_id` (unique), `firm_id`, role (`attorney | partner | admin`).
- `platform_admins`: our own operators. It grants **no** access to client data.
- Add `firm_id` to `offices`, `attorneys`, `consult_types`, `appointments`, `intakes`,
  `conflict_parties`, `conflict_hits`, `documents`, `agreements`, `invoices`, `payments`,
  `message_threads`, `notification_log`, `audit_log`. `availability_*` and `messages` inherit it
  through their parent row.
- Scope uniqueness per firm: `offices (firm_id, name)`, `attorneys (firm_id, slug)`,
  `consult_types (firm_id, slug)`.
- Use composite foreign keys, such as `appointments (firm_id, attorney_id)` referencing
  `attorneys (firm_id, id)`, so the database rejects a row that mixes two firms.
- Backfill existing rows and staff into a `default-firm` only if the database already holds data,
  so a fresh production database starts with no firm. Then drop `profiles.role`, so being staff
  means having a membership. Harlow & Reyes is a sample name and exists only in the dev seed.

**Authorization**
- Add `current_firm_id()`. `is_staff()` and `is_manager()` read memberships and still require aal2.
- Rewrite every staff and manager policy to compare `firm_id` to `current_firm_id()`. These leaks
  need specific fixes:
  - `profiles_select`: staff may read colleagues and clients of their firm only, not everyone.
  - `documents_select`: `attorney_has_client(owner_id)` currently exposes **all** of a client's
    documents, including those from another firm. Scope it to `documents.firm_id`.
  - `conflict_*`: conflict checks match only within the firm.
  - `invoices`, `payments`, `audit_log`, `notification_log`: firm-scoped.
- Storage: `client-documents` paths become `{firm_id}/{owner_id}/{uuid}-{file}` and policies check
  both parts. `avatars` staff reads narrow to the firm's own people. `attorney-photos` writes are
  limited to the firm's own folder.
- `webhook_events` primary key becomes `(provider, account_id, id)`.

**App code**
- `lib/auth/session.ts`: load the membership and firm; `requireStaff()` returns the firm.
  `requireClient()` stops redirecting staff, because a staff member can be a client of another firm.
- `scripts/create-staff-user.mjs`: add `--firm`.

**Tests (required to merge)**
- SQL tests with two firms, attempting every cross-firm read and write as attorney, partner, admin,
  client and anon. Include storage objects.
- Run them locally with `npm run db:test`, and in GitHub Actions on every pull request. CI moves
  up from the hardening phase for this reason.

## Phase 3: Firm booking pages and wizard on real data (done)
- Move `/attorneys` and `/book/*` under `/f/[firmSlug]`, and update the matcher in `proxy.ts`.
- Solo firms skip the directory and go straight to the attorney's page.
- Replace the hard-coded "Harlow & Reyes" text (`app/layout.tsx`, `app/(marketing)/page.tsx`,
  `components/booking/header.tsx`, `footer.tsx`, `book-agreement-screen.tsx`,
  `book-intake-screen.tsx`) with firm data. Metadata comes from the firm too.
- The rest is unchanged from the original plan, firm-scoped: server-side slots, 15-minute holds,
  conflict check, uploads, versioned agreements. Agreement text is per firm.
- All booking goes through one server-side check, `firm_can_accept_bookings()`, so Phase 8 can
  switch it on without touching the wizard.
- Carried forward from this phase:
  - Paid consultations stop at the payment step with a notice until Phase 4.
  - Guest bookings link to an account by the email typed, without proving the visitor owns it.
    Phase 6 adds an emailed code before a guest booking is confirmed.
  - Anyone can place 15-minute holds; Phase 9's rate limits and Turnstile cover abuse.
  - Attorney photos still show a placeholder until firm settings (Phase 5) can upload them.
  - The product name in `lib/brand.ts` is a placeholder.

## Phase 4: Consultation fee payments (per firm)
- **Start with a short spike on connecting firm accounts:**
  1. Preferred: PayMongo **Linked Accounts** (formerly Platforms), so firms are onboarded under our
     parent account and we never store their keys. Confirm with PayMongo that funds settle to the
     firm and we aren't treated as holding them, that hosted checkout and refunds work, and what
     it costs.
  2. Fallback: each firm enters its own API keys, encrypted at rest and never returned to the
     browser, with a webhook registered per firm.
- Don't configure any split that pays us a share of a fee.
- Checkout session and webhook per the original plan, with `/api/webhooks/paymongo/[firmId]` if the
  fallback is used. Signature check, idempotent processing, refunds by partners.
- Firms with no connected account can offer only free consultations.
- Add a daily reconciliation job: **PayMongo does not resend missed webhooks.**

## Phase 5: Portal and staff dashboard on real data
As in the original plan, firm-scoped, plus:
- Staff invites and attorney management, replacing `npm run staff:create` for firm use.
- Firm settings: profile, branding, consultation types and prices, offices, agreement text,
  cancellation policy.
- Portal lists items across firms with a firm label. Messaging stays within a firm.

## Phase 6: Notifications
As in the original plan, plus:
- Email sends from our verified domain with the firm's name as sender and its address as reply-to.
- SMS uses our PhilSMS account and is **metered per firm**, because each message costs us money.
  Keep SMS free of case details, as already planned.

## Phase 7: Firm signup and platform admin
- Self-service signup: account, mandatory MFA, firm name and slug, first attorney, go live.
- IBP roll number check before a firm's page is published. Manual review in our admin area is
  enough to start.
- Platform admin: firm list, status, subscription, suspend, comp. It shows no client data, and every
  action is written to `audit_log`.
- Early firms can be onboarded by hand with a comped status before Phase 8 ships.

## Phase 8: Subscriptions
- Tables: `plans` (price, attorney limit, monthly SMS allowance) and `firm_subscriptions` (status,
  period end, PayMongo ids).
- Env vars: `PLATFORM_PAYMONGO_SECRET_KEY` and `PLATFORM_PAYMONGO_WEBHOOK_SECRET`, kept separate
  from anything firm-related.
- Webhook `/api/webhooks/paymongo/platform` handles `subscription.activated`, `subscription.updated`,
  `subscription.past_due`, `subscription.unpaid`, `subscription.invoice.paid`,
  `subscription.invoice.payment_failed`. Check the event list against the current reference; PayMongo's
  own pages differ slightly.
- Daily reconciliation against the Subscriptions API, because missed webhooks aren't resent.

| PayMongo or internal status | New bookings | Staff dashboard |
| --- | --- | --- |
| `trialing`, `comped`, `active` | Yes | Full |
| `past_due` (PayMongo retries daily, up to 3 times) | Yes, with a warning to the firm | Full |
| `unpaid`, `cancelled` | **No** | Existing matters and export; billing page prompts to pay |

- **GCash:** not on the recurring list, so firms wanting it get a one-period payment link that
  extends `current_period_end`, with a reminder before it runs out. Add this only if firms ask.
- Billing page: choose a plan, update payment method, invoices, cancel.
- Enforce limits on the server (attorney count, SMS allowance), not only in the UI.
- Cancellation: export, a stated retention period, then deletion. A firm's client records may have
  legal retention duties, so a lawyer should confirm the period.

## Phase 9: Hardening and launch
As in the original plan (CSP, rate limits, Turnstile, error pages, SEO, Playwright), plus:
- SaaS terms, privacy policy, and a data processing agreement with each firm (under RA 10173 we
  generally act as their processor).
- A documented process for breach notification to firms.
- Reserved slugs (`admin`, `api`, `staff`, and so on) and a check on lookalike firm names.
- Hosting: Vercel until launch. Moving to a VPS later means adding a Dockerfile for the app
  (Next.js `output: "standalone"`) and a reverse proxy with TLS. It also means choosing between
  hosted Supabase and self-hosting it. Scheduled jobs such as reminders and PayMongo
  reconciliation must not depend on Vercel-only features.

## Needed from you
- **Pricing:** plans, attorney limits, SMS allowance, trial length.
- **PayMongo:** ask about Linked Accounts for this use case (see Phase 4). No code depends on this
  until Phase 4.
- **Lawyer review:** fee arrangement, data processing agreement, retention, and how attorneys may
  promote their booking pages.

## Sources for PayMongo behaviour
- [Subscriptions](https://docs.paymongo.com/docs/payment-acceptance-subscriptions)
- [Subscription resource](https://docs.paymongo.com/reference/subscription-resource)
- [Webhooks](https://developers.paymongo.com/docs/webhooks)
- [Webhook testing](https://docs.paymongo.com/docs/webhook-testing)
- [Accounts](https://docs.paymongo.com/reference/accounts)
- [Platforms](https://www.paymongo.com/products/platform)
