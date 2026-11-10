# Online Legal Consultation Booking

Clients find an attorney, book a consultation, and manage it in a client portal. Attorneys
and partners work from a staff dashboard.

Stack:
- **Next.js 16** (App Router), deployed on **Vercel**
- **Supabase**: Postgres with RLS, Auth, Storage and Edge Functions
- **PayMongo**: payments
- **Resend**: email
- **PhilSMS**: SMS

The firm's timezone is Asia/Manila and its currency is PHP. Money is stored as integer centavos.

> Production rollout is phased. See [Rollout status](#rollout-status).

## Local development

Prerequisites:
- Node 20+
- Docker Desktop, for the local Supabase stack

```bash
npm install
cp .env.example .env.local        # fill in values (see below)
npx supabase start                # local Postgres/Auth/Storage; prints local URL + keys
npm run db:reset                  # applies supabase/migrations + supabase/seed.sql
npm run dev
```

Point `.env.local` at the local stack, using the values `supabase start` prints. Local auth
emails (sign-in codes) appear in Mailpit at http://localhost:54324.

Create your first staff account. The seed includes a fictional firm, `harlow-reyes`:

```bash
npm run staff:create -- --firm harlow-reyes --email you@firm.ph --role admin --first Jane --last Reyes
# link to an attorney profile:  --role attorney --attorney maria-chen
# create a new firm as well:    --firm santos-law --firm-name "Santos Law Office"
```

Sign in at `/staff/login`. On first login you're asked to enroll an authenticator app.

To review firms, make yourself an operator (an existing account keeps its password) and sign
in at `/admin/login`, also with an authenticator app:

```bash
npm run admin:create -- --email you@example.com --first Jane --last Reyes
# remove:  --email you@example.com --remove
```

The seeded firm's booking page is at http://localhost:3000/f/harlow-reyes. Each firm's public
pages live under `/f/<firm-slug>`, and a firm with one attorney goes straight to their profile.

Run the tests:

```bash
npm test          # unit tests (slot generation, Manila time, webhook signatures)
npm run db:test   # database tests: firm isolation, conflict checks, payment secrets
npm run test:e2e  # browser tests: booking, payments (mock PayMongo), staff sign-in, portal, dashboard, firm settings, notifications, reminders, signup, admin
```

`npm run test:e2e` resets the **local** database, builds the app and serves it on port 3100,
with a mock PayMongo server on 4010 and a mock Resend server on 4020. It needs Docker, `npx supabase start`, and
`npx playwright install chromium` once. Pass a suite name to run one: `npm run test:e2e -- payments`.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable (anon) key; RLS applies |
| `NEXT_PUBLIC_SITE_URL` | browser + server | Canonical production URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Admin tasks only |
| `PAYMONGO_SECRET_KEY` | **server only** | The platform's parent PayMongo account (`sk_test_…` / `sk_live_…`) |
| `CRON_SECRET` | **server only** | Bearer token for the `/api/cron/*` jobs (32+ characters) |
| `RESEND_API_KEY` | **server only** | Resend API key (`re_…`). Without it, no notification emails are queued or sent |
| `EMAIL_FROM` | **server only** | Sending address on our verified domain, e.g. `notifications@mail.example.com` |
| `PHILSMS_API_TOKEN` | **server only** | PhilSMS API token. Without it (or the sender ID), no texts are sent; reminders still go by email |
| `PHILSMS_SENDER_ID` | **server only** | Our sender name approved by PhilSMS (up to 11 letters or digits) |

`lib/env.ts` validates these at startup. Server secrets live in `lib/env.server.ts`, which
is guarded by `server-only` so they can never be bundled into client code.

## Architecture

- **Authorization is Row Level Security.** Every table has RLS on, and the policies are in
  `supabase/migrations/`. Staff privileges also require an MFA-verified session (JWT
  `aal = aal2`), so a stolen staff password alone can't read client data.
- **Route protection:**
  - `proxy.ts` refreshes the session and redirects signed-out visitors (optimistic only).
  - `app/portal/(account)/layout.tsx` calls `requireClient()` and
    `app/staff/(dashboard)/layout.tsx` calls `requireStaff()`. Both helpers are in
    `lib/auth/session.ts` and verify the JWT server-side. Billing additionally requires a
    partner/admin role.
- **Auth flows:**
  - Clients sign in with an emailed 6-digit code. Accounts are created at booking, and
    login never creates accounts or reveals whether an email is a client.
  - Staff sign in with email + password, plus a **mandatory** TOTP authenticator app,
    which they enroll at `/staff/mfa-setup` on first login.
- **Firms:** a firm is the customer, and a solo attorney is a firm of one. Every firm's data
  is isolated by `firm_id`: RLS scopes access to the caller's firm, and composite foreign keys
  make the database reject any row that mixes two firms. `supabase/tests/database/` tests this,
  and CI runs those tests on every pull request.
- **Roles** (`firm_memberships.role`): `attorney`, `partner`, `admin`. Staff belong to one
  firm, and anyone without a membership is a client. A client can use several firms with one
  login, and each firm sees only its own dealings with them. Only the service role can change
  memberships, through `scripts/create-staff-user.mjs` now and the admin UI later.
- **Double-booking** is impossible at the database level: `appointments` has a GiST
  exclusion constraint on `(attorney_id, during)` for active statuses.
- **Public booking** runs in server actions (`lib/booking/actions.ts`) with the service role,
  because visitors aren't signed in. Picking a time creates a 15-minute hold, and an httpOnly
  cookie scoped to `/f/<firm>` carries a random token whose SHA-256 hash is stored on the
  appointment. Every later step proves ownership with that cookie. Open times are computed on
  the server from weekly hours, leave and existing bookings, in Asia/Manila time.
- **Supabase clients:** `lib/supabase/server.ts` (user, RLS), `lib/supabase/client.ts`
  (browser), and `lib/supabase/admin.ts` (service role, server-only).
- **DB types:** `lib/supabase/database.types.ts`. Regenerate it with `npm run db:types`
  after linking a project (`npx supabase link`).

### Online payments (PayMongo Linked Accounts)

Each firm's own PayMongo account is linked under the platform's parent account. Checkouts,
refunds and webhooks use the parent secret key plus the firm's `Account-ID`, so payments settle
to the firm, which stays merchant of record. The platform takes no share of them.

Connect a firm, until firms can do it themselves:

```bash
npm run paymongo:link -- --firm santos-law --invite atty@santoslaw.ph   # send a linking invitation
npm run paymongo:link -- --firm santos-law --check                      # after they accept it
npm run paymongo:link -- --firm santos-law --account org_…              # already linked in PayMongo
```

Activating registers a webhook on the firm's account at
`<NEXT_PUBLIC_SITE_URL>/api/webhooks/paymongo/<firm id>`, so the site must be reachable over
HTTPS (use `--webhook-base` with a tunnel in development). Until a firm is connected, its paid
consultation types can't be booked online; free ones still can.

Clients have 30 minutes to pay before their time is released. `/api/cron/reconcile-payments`
runs daily (`vercel.json`) to settle payments whose webhook never arrived, because PayMongo
doesn't resend them. Partners and admins refund from **Staff → Billing**.

### Email notifications (Resend)

Emails go out from `EMAIL_FROM` on our verified domain, with the firm's name as the sender
and, for client emails, the firm's contact email as reply-to. They carry only booking facts
(time, attorney, place, meeting link) and never case details or message text; recipients sign
in to read those. Templates are in `lib/notify/templates.ts`, and `lib/notify/events.ts`
decides who hears about what:

| Event | Client | Staff |
| --- | --- | --- |
| Booking confirmed | Confirmation with an `.ics` file, plus a receipt if paid | The attorney; partners and admins too if urgent, a possible conflict, or no linked attorney |
| Client reschedules or cancels | New time or cancellation, with an updated `.ics` | The attorney |
| Attorney approves, declines, reassigns, sets a video link | An email for each | The new attorney, on reassignment |
| Message | "You have a new message" | "New client message", at most once per thread every 15 minutes |
| Refund due (cancel, decline, late payment) | Told a refund is coming | Partners and admins |
| Staff invite | | The invitee gets the link |
| Guest books without signing in | A 6-digit code to confirm the email, before the intake is saved | |
| A day and an hour before a booking | A reminder email, plus a text if they agreed to texts | Partners and admins, once a month, if the firm hits its text limit |

Emails are queued in `notification_log` (one row per email, de-duplicated by `dedupe_key`)
and sent right after the response. Failures are retried after 1, 5, 30, 120 and 360 minutes by
`/api/cron/send-notifications`, which pg_cron calls every five minutes through pg_net. Emails
not sent within 24 hours are marked failed instead of going out late. Invite emails and guest
booking codes are sent directly, because they hold secrets that are only stored as hashes.

Without `RESEND_API_KEY`, `next dev` skips the guest email code so local booking still works.
A production build refuses guest bookings instead, since it can't confirm the address.

Supabase Auth's own emails (portal sign-in codes and email change links) go through Resend's
SMTP on hosted projects (see Deploying). Locally they land in Mailpit.

### Reminders and texts (PhilSMS)

Confirmed bookings get two reminders: one 20 to 24 hours before the start (for bookings made
more than a day ahead) and one 10 to 60 minutes before (for bookings made at least two hours
ahead). Each goes by email, and also by text when the client ticked "Send me appointment
reminders by text message" on that booking's intake. The worker claims due reminders in
`appointment_reminders`, once per booking, kind and start time, so a rescheduled booking is
reminded of its new time only, and a reminder whose booking was canceled or moved before it
went out is skipped.

Texts go out through PhilSMS under our one approved sender ID, with the firm's name at the
start of the message. Like emails they hold only who, when and how (never case details or
the meeting link) and are queued and retried in `notification_log` (channel `sms`). PhilSMS
has no idempotency key, so only failures where nothing was sent are retried.

Each firm may send `firms.sms_monthly_cap` texts per calendar month in Philippine time
(default 200), counted in `sms_usage`. Over the cap, texts are skipped (emails still go) and
the firm's partners and admins get one email that month. Partners and admins see the count
under **Staff → Firm**. Until plans arrive in Phase 8, an operator changes a firm's cap in SQL:
`update firms set sms_monthly_cap = 500 where slug = '<firm>';`.

### Firm signup

Anyone can sign up a firm at `/signup`: their name, email and password, the firm's name and
booking page address (`/f/<slug>`), whether they're the attorney or the office manager, and the
first attorney's roll number and year admitted. We email a 6-digit code to confirm the address
(our own code through the Resend API, like guest booking codes), and nothing is created until
it's entered. Then the signer becomes the firm's admin (and its linked attorney, if they are
one), sets up two-factor, and lands in the dashboard.

A new firm is `pending`: staff can set everything up, but the booking page returns 404. The
dashboard shows a checklist (an attorney with roll number and year, a consultation type, weekly
hours, a contact email). When it's done, a partner or admin clicks **Ask to go live**, which
records `review_requested_at` and emails our operators. An operator then reviews it in the
admin area (below).

An email that already has an account (a client of some firm) can sign up once the code proves
it's theirs; the new password replaces the old one. Someone already on a firm's staff is told
to sign in instead. Without `RESEND_API_KEY`, `next dev` skips the code; production refuses
signups.

### Platform admin

Our operators (`platform_admins`, added with `npm run admin:create`) sign in at `/admin/login`
with a password and an authenticator app. Anyone else who is signed in gets "not found" there.
The area shows firm-level data only (firm details, staff names and emails, attorneys' roll
numbers), never a firm's bookings, clients, messages, documents or payments.

- **Firms** lists every firm, the ones waiting for review first, with filters for firms waiting,
  live firms with attorneys to check, live, setting up and suspended.
- **A firm's page** shows its setup checklist, its attorneys' names, roll numbers and years to
  look up on the Supreme Court's Roll of Attorneys, and its history. Operators:
  - **Mark an attorney as checked.** Only checked attorneys appear on the booking page. A new
    attorney, or one whose name, roll number or year changes, is hidden until checked, and
    operators are emailed when a live firm adds one. Attorneys at firms that were live before
    7b count as checked.
  - **Approve** a firm once its checklist is done and an attorney is checked. The page goes live
    and the firm's partners and admins are emailed.
  - **Send back** with a note: the firm sees the note in its dashboard and by email, and can ask
    again.
  - **Suspend** with a reason (the booking page goes offline; staff can still sign in), and
    **reinstate**. A firm suspended before it was ever approved goes back to waiting for review.
  - **Comp** a firm, with an optional end date and an internal note. Nothing uses it until
    subscriptions (Phase 8) treat a comped firm as paid until that date.
- **Audit log** lists every operator action. Each action runs a database function that checks
  the operator's two-factor session and writes `audit_log` itself.

Emails about these decisions come from the platform's name, not the firm's.

## Deploying (Vercel + Supabase)

1. Create **two Supabase projects**, staging and production. Enable PITR backups on production.
2. Apply the migrations: `npx supabase link --project-ref <ref>`, then `npm run db:push`.
   **Never** run `seed.sql` against production.
3. In each Supabase dashboard, open **Authentication** and configure:
   - **URL Configuration**: Site URL = your domain.
   - **Providers → Email**: confirm email ON. Set the OTP length to 6 and the OTP expiry
     to 600s.
   - **Email Templates → Magic Link**: subject "Your sign-in code"; paste the body of
     `supabase/templates/magic_link.html`. It includes `{{ .Token }}`, without which the email
     has no code.
   - **Email Templates → Change Email Address**: subject "Confirm your new sign-in email"; paste
     the body of `supabase/templates/email_change.html`. Its link goes to `/auth/confirm` with
     `type=email_change`.
   - **Providers → Email**: keep **Secure email change** ON, so both the old and the new
     address must confirm. It only takes effect with "Confirm email" ON (above); with it off, one
     link is enough.
   - **URL Configuration → Redirect URLs**: add `https://<your-domain>/auth/confirm` (and
     `http://localhost:3000/auth/confirm` on the dev project).
   - **Multi-Factor**: TOTP enabled.
   - **Passwords**: minimum length 12, with lowercase, uppercase and digits required.
   - **SMTP Settings**: enable custom SMTP with host `smtp.resend.com`, port `465`, username
     `resend`, password = a Resend API key (a separate key with sending access only is best),
     sender email = `EMAIL_FROM`, sender name = the product name. The default Supabase mailer
     only sends to team members and is not for production.
   - **Rate Limits**: with custom SMTP, raise "emails sent per hour" from its default of 30 to
     fit sign-in and email-change traffic across all firms (guest booking codes don't count;
     they go through the Resend API).
   In the SQL editor, give the email worker the site's address and the cron secret (once per
   project). Until both exist, the scheduled job does nothing:
   ```sql
   select vault.create_secret('https://<your-domain>', 'app_url');
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
   ```
   In Resend, verify the sending domain (SPF, DKIM, DMARC) before setting `EMAIL_FROM`.
   Use the PhilSMS platform at dashboard.philsms.com (accounts, credit and API tokens on the
   retired app.philsms.com don't carry over). Have the sender ID approved before setting
   `PHILSMS_SENDER_ID`, and keep the account's credit topped up: a firm's cap limits what it
   can send, not our balance. The cap counts texts, while PhilSMS bills per 160-character part,
   and a day-before reminder is usually two parts.
4. In Vercel, import the repo and set the env vars above for Preview (staging project) and
   Production (production project). Use a PayMongo test key on Preview and the live key only on
   Production.
5. Make yourself an operator against production with `npm run admin:create -- --email <you>`,
   using the production env values, then sign in at `/admin/login` to review firms that sign up.
   To set up a firm by hand instead, use `npm run staff:create` with `--firm <slug> --firm-name
   "<name>"`. A fresh production database starts with no firms.

## Rollout status

The product is moving to a subscription service for law firms, with a separate booking page
for each firm. Details are in [docs/saas-plan.md](docs/saas-plan.md).

- [x] Phase 1: Supabase foundation: schema + RLS, storage buckets, real client/staff auth with staff MFA
- [x] Phase 2: Multi-tenant foundation: firms, memberships, firm-scoped RLS and storage, cross-firm tests in CI
- [x] Phase 3: Firm booking pages + booking wizard on real data (slots, holds, server-side conflict check, uploads)
- [x] Phase 4: Per-firm PayMongo checkout + webhook for consultation fees
- [x] Phase 5: Portal + staff dashboard on real data, staff invites, firm settings, in three PRs:
  - [x] 5a: Client portal on real data (appointments with reschedule/cancel, messages, documents, invoices)
  - [x] 5b: Staff dashboard on real data (calendar, intake queue, conflicts, analytics, availability, messages)
  - [x] 5c: Firm settings, staff invites, attorney management
- [x] Phase 6: Email (Resend) + SMS (PhilSMS) notifications and reminders, with SMS metered per firm, in three PRs:
  - [x] 6a: Email notifications for bookings, payments, messages and staff invites, with a retrying queue
  - [x] 6b: Supabase Auth email through Resend, an emailed code for guest bookings, email change in the portal
  - [x] 6c: SMS through PhilSMS, 24-hour and 1-hour reminders, per-firm SMS cap
- [x] Phase 7: Firm self-service signup + platform admin, in two PRs:
  - [x] 7a: Self-service firm signup with an emailed code, a setup checklist, and asking to go live
  - [x] 7b: Platform admin: firm list, IBP review and approval, suspend, comp, audit log
- [ ] Phase 8: Subscriptions (PayMongo recurring billing, plan limits, lapsed-firm handling)
- [ ] Phase 9: Hardening and launch (CSP, rate limits, error pages, SEO, E2E tests, legal documents)

Everything runs on real data. Firms sign up at `/signup` and manage their settings, staff and
attorneys in the dashboard, and our operators review them at `/admin`. `npm run staff:create`
remains for setting up a firm by hand; firms it creates are live at once, without review, but
attorneys added to them still need an operator's check before they're listed.
