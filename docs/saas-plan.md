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

## Phase 4: Consultation fee payments (per firm) (done)
- **Decided: PayMongo Linked Accounts.** PayMongo confirmed that payments made on a firm's behalf
  settle to the firm's own (child) account, which stays merchant of record. Checkout and refunds
  run with our parent secret key plus an `Account-ID: org_…` header. There are no per-firm fees,
  and existing PayMongo accounts can be invited and linked. We never hold firms' keys or funds.
  - Firms connect by accepting our linking invitation (existing account) or by being created
    through the Accounts API (new account). Store only the firm's `org_…` id and link status.
  - The policy contract must grant checkout, payment and refund access for the child.
  - Webhooks are registered per child account until PayMongo ships a consolidated parent webhook.
  - Confirm early in testing that checkout sessions accept the `Account-ID` header.
- Don't configure PayMongo's optional fee split: we take no share of consultation fees.
- Checkout session and webhook per the original plan, with `/api/webhooks/paymongo/[firmId]` if the
  fallback is used. Signature check, idempotent processing, refunds by partners.
- Firms with no connected account can offer only free consultations.
- Add a daily reconciliation job: **PayMongo does not resend missed webhooks.**
- Carried forward from this phase:
  - Built and tested against a local mock of PayMongo. Fields the API reference left unstated
    (the checkout URL, the webhook's `secret_key`, the invitation response, the payment-methods
    endpoint) still need checking against real test-mode responses.
  - The invitation API is marked "coming soon" in PayMongo's docs. If it isn't live, link firms
    from the PayMongo dashboard and record them with `--account org_…`.
  - Linking and its webhooks only work in live mode, so the full flow needs one small live
    payment, refunded afterwards, against a firm account we control.
  - Firms are connected by an operator script; self-service connection belongs in Phase 7.
  - Refunds are full only. Refund status updates from PayMongo are recorded only as "refunded".
  - A payment that arrives after its time was given away is flagged "refund due" on Billing;
    the firm isn't notified until Phase 6.

## Phase 5: Portal and staff dashboard on real data
As in the original plan, firm-scoped, plus:
- Staff invites and attorney management, replacing `npm run staff:create` for firm use.
- Firm settings: profile, branding, consultation types and prices, offices, agreement text,
  cancellation policy.
- Portal lists items across firms with a firm label. Messaging stays within a firm.

It ships as three PRs, each branched off master:

| PR | Scope |
| --- | --- |
| 5a: client portal (done) | Appointments, messages, documents, invoices, SMS opt-in |
| 5b: staff dashboard (done) | Calendar, intake queue, conflicts, analytics, meeting links, availability, staff side of messages and documents |
| 5c: firm settings and staff | Settings listed above, staff invites, attorney management |

Decisions:
- **Staff invites** are one-time links, valid for 7 days, that a partner or admin copies and sends
  themselves. Phase 6 emails them automatically.
- **A client canceling a paid consultation** before the cutoff frees the time and shows the payment
  as "refund due" on Billing. A partner refunds it with the existing button. Nothing is refunded
  automatically.
- **Partners and admins** (`is_firm_manager`) manage firm settings, staff and attorneys. Attorneys
  edit only their own profile and availability.

5a details:
- The portal lists bookings that were ever confirmed (`appointments.confirmed_at`), so abandoned
  holds and checkouts never show. Every query also filters to the signed-in client, because
  staff can be clients of another firm.
- Clients cancel or reschedule online up to `firms.cancellation_cutoff_hours` (default 24) before
  the start. A reschedule keeps the attorney and length, and accepts only times the server offers.
  Both are written to `audit_log`.
- Clients can message any attorney they've had a booking with. Read receipts go through
  `mark_thread_read()`, so a sent message can't be edited.
- Documents uploaded in the portal belong to one firm, chosen by the client, and are capped at
  100 per firm. Downloads use 60-second signed links.
- Carried forward from 5a:
  - Staff can't read or answer portal messages yet (5b). The portal checks for replies every
    30 seconds; email alerts come in Phase 6.
  - Changing the sign-in email waits for Phase 6, which sets up reliable email for the
    confirmation messages.
  - No invoice is ever "due" yet: invoices are only created when an online payment succeeds. A
    "Pay now" button arrives with staff-issued invoices.
  - The cancellation cutoff is fixed at 24 hours until firm settings (5c) can change it.

5b details:
- Every page reads with the staff member's own permissions, so RLS decides scope: an attorney
  sees their own bookings, messages and hours; a partner or admin sees the whole firm.
- Each booking has a detail page with the intake, conflict matches (never shown to the client),
  documents, agreement, payment, meeting link and outcome. The calendar and queue link to it.
- Review: attorneys approve or decline their own bookings; partners and admins can also reassign.
  A reassigned video call moves to the new attorney's standing link unless a custom link was set.
  Declining a paid booking shows it on Billing as a refund due. Everything is audited.
- Outcomes (completed, client didn't attend) can be recorded once a consultation has started.
- Conflict search is fuzzy (`search_conflict_parties()`), and partners and admins add or remove
  records.
- Weekly hours are replaced in one step (`replace_weekly_hours()`). Time off blocks whole days;
  bookings already in that time are kept, with a warning.
- Staff can add documents to a client's file and download the client's documents; downloads are
  audited.
- Analytics are computed from the month's bookings, scoped by RLS. Partners and admins also see
  fees collected online, and Billing shows fees by attorney.
- Carried forward from 5b:
  - Staff and clients aren't notified of new messages, approvals, declines or reassignments until
    Phase 6. Both inboxes check for new messages every 30 seconds.
  - Reassigning checks only that the new attorney is free at that time, not their working hours.
  - Analytics run in app code rather than SQL views. That's fine at a firm's volume; revisit if
    pages slow down.
  - Linking a staff account to an attorney profile still uses `npm run staff:create` (5c).

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
