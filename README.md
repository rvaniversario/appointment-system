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

Create your first staff account:

```bash
npm run staff:create -- --email you@firm.ph --role admin --first Jane --last Reyes
# link to an attorney profile:  --role attorney --attorney maria-chen
```

Sign in at `/staff/login`. On first login you're asked to enroll an authenticator app.

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
- **Roles** (`profiles.role`): `client`, `attorney`, `partner`, `admin`. Users can't
  change their own role; column grants block it. Only the service role can change roles,
  through `scripts/create-staff-user.mjs` now and the admin UI later.
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
   - **Email Templates → Magic Link**: include `{{ .Token }}` so users get a code. See
     `supabase/templates/magic_link.html`.
   - **Multi-Factor**: TOTP enabled.
   - **Passwords**: minimum length 12, with lowercase, uppercase and digits required.
   - **SMTP**: Resend. The default Supabase mailer is rate-limited and not for production.
4. In Vercel, import the repo and set the env vars above for Preview (staging project) and
   Production (production project).
5. Bootstrap the first admin against production with `npm run staff:create`, using the
   production env values.

## Rollout status

- [x] Phase 1: Supabase foundation: schema + RLS, storage buckets, real client/staff auth with staff MFA
- [ ] Phase 2: Directory + booking wizard on real data (slots, holds, server-side conflict check, uploads)
- [ ] Phase 3: PayMongo checkout + webhook
- [ ] Phase 4: Portal + staff dashboard on real data, admin attorney management
- [ ] Phase 5: Email (Resend) + SMS (PhilSMS) notifications and reminders
- [ ] Phase 6: Hardening (CSP, rate limits, error pages, SEO, tests, CI)

Until Phases 2–4 land, the directory, booking wizard, portal and dashboard **contents**
still come from the sample data in `lib/booking/`. Only authentication and access
control are real.
