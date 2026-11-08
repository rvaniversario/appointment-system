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

Run the database tests, which prove one firm can't reach another firm's data:

```bash
npm run db:test
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable (anon) key; RLS applies |
| `NEXT_PUBLIC_SITE_URL` | browser + server | Canonical production URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Admin tasks only |

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
- **Supabase clients:** `lib/supabase/server.ts` (user, RLS), `lib/supabase/client.ts`
  (browser), and `lib/supabase/admin.ts` (service role, server-only).
- **DB types:** `lib/supabase/database.types.ts`. Regenerate it with `npm run db:types`
  after linking a project (`npx supabase link`).

## Deploying (Vercel + Supabase)

1. Create **two Supabase projects**, staging and production. Enable PITR backups on production.
2. Apply the migrations: `npx supabase link --project-ref <ref>`, then `npm run db:push`.
   **Never** run `seed.sql` against production.
3. In each Supabase dashboard, open **Authentication** and configure:
   - **URL Configuration**: Site URL = your domain.
   - **Providers → Email**: confirm email ON. Set the OTP length to 6 and the OTP expiry
     to 600s.
   - **Email Templates → Magic Link**: paste the body of `supabase/templates/magic_link.html`.
     It includes `{{ .Token }}`, without which the email has no code.
   - **URL Configuration → Redirect URLs**: add `https://<your-domain>/auth/confirm` (and
     `http://localhost:3000/auth/confirm` on the dev project).
   - **Multi-Factor**: TOTP enabled.
   - **Passwords**: minimum length 12, with lowercase, uppercase and digits required.
   - **SMTP**: Resend. The default Supabase mailer is rate-limited and not for production.
4. In Vercel, import the repo and set the env vars above for Preview (staging project) and
   Production (production project).
5. Bootstrap a firm's first admin against production with `npm run staff:create`, using the
   production env values and `--firm <slug> --firm-name "<name>"`. A fresh production database
   starts with no firms.

## Rollout status

The product is moving to a subscription service for law firms, with a separate booking page
for each firm. Details are in [docs/saas-plan.md](docs/saas-plan.md).

- [x] Phase 1: Supabase foundation: schema + RLS, storage buckets, real client/staff auth with staff MFA
- [x] Phase 2: Multi-tenant foundation: firms, memberships, firm-scoped RLS and storage, cross-firm tests in CI
- [ ] Phase 3: Firm booking pages + booking wizard on real data (slots, holds, server-side conflict check, uploads)
- [ ] Phase 4: Per-firm PayMongo checkout + webhook for consultation fees
- [ ] Phase 5: Portal + staff dashboard on real data, staff invites, firm settings
- [ ] Phase 6: Email (Resend) + SMS (PhilSMS) notifications and reminders, with SMS metered per firm
- [ ] Phase 7: Firm self-service signup + platform admin
- [ ] Phase 8: Subscriptions (PayMongo recurring billing, plan limits, lapsed-firm handling)
- [ ] Phase 9: Hardening and launch (CSP, rate limits, error pages, SEO, E2E tests, legal documents)

Until Phases 3–5 land, the directory, booking wizard, portal and dashboard **contents**
still come from the sample data in `lib/booking/`. Only authentication and access
control are real.
