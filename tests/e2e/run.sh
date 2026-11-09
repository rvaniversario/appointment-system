#!/usr/bin/env bash
# End-to-end browser tests against a production build and the LOCAL Supabase stack.
#
#   tests/e2e/run.sh [all|booking|payments|staff-auth|portal|staff-dashboard|firm-settings|notifications|reminders]
#
# Needs Docker with `npx supabase start` running, and Playwright's browser installed once:
#   npx playwright install chromium
#
# It RESETS THE LOCAL DATABASE (never the hosted one), adds test firms and accounts, links the
# sample firm to a mock PayMongo server on :4010, sends email to a mock Resend server on :4020
# and texts to a mock PhilSMS server on :4030,
# builds the app and serves it on :3100.
# Set SKIP_BUILD=1 to reuse the last build.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
E2E="$ROOT/tests/e2e"
cd "$ROOT"
SUITE=${1:-all}

# Keys for the local stack, read from the CLI so none are stored in the repo.
LOCAL_ENV=$(npx supabase status -o env 2>/dev/null) || { echo "Local Supabase isn't running. Start Docker, then \`npx supabase start\`."; exit 1; }
local_value() { printf '%s\n' "$LOCAL_ENV" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
export NEXT_PUBLIC_SUPABASE_URL=$(local_value API_URL)
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(local_value PUBLISHABLE_KEY)
export SUPABASE_SERVICE_ROLE_KEY=$(local_value SECRET_KEY)
[ -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || { echo "Couldn't read local Supabase keys."; exit 1; }
export NEXT_PUBLIC_SITE_URL=http://localhost:3100
export PAYMONGO_SECRET_KEY=sk_test_mock PAYMONGO_API_BASE=http://localhost:4010
export CRON_SECRET=cron-secret-for-local-testing-only-0123456789
export RESEND_API_KEY=re_mock RESEND_API_BASE=http://localhost:4020 EMAIL_FROM=notifications@e2e.test
export PHILSMS_API_TOKEN=philsms-mock-token PHILSMS_SENDER_ID=E2ELaw PHILSMS_API_BASE=http://localhost:4030/api/v3

stop() {
  for port in 3100 4010 4020 4030; do
    if command -v taskkill > /dev/null; then
      for p in $(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$p" //F > /dev/null 2>&1; done
    else
      fuser -k "$port/tcp" > /dev/null 2>&1 || true
    fi
  done
}
trap stop EXIT
stop

case "$NEXT_PUBLIC_SUPABASE_URL" in http://127.0.0.1:*) ;; *) echo "Refusing to run against a non-local database."; exit 1 ;; esac
npx supabase db reset --local 2>&1 | grep -q "Finished supabase db reset" || { echo "Database reset failed. Is Docker running, and \`npx supabase start\`?"; exit 1; }

# A solo firm without PayMongo, to check the one-attorney redirect and that paid types are blocked.
docker exec -i supabase_db_online-appointment-system psql -q -U postgres -d postgres -c "
  insert into firms (id, slug, name, status) values ('00000000-0000-4000-c000-0000000000e2', 'solo-e2e', 'Solo E2E Law', 'active');
  insert into attorneys (firm_id, slug, full_name) values ('00000000-0000-4000-c000-0000000000e2', 'lone-attorney', 'Lone Attorney');
  insert into consult_types (firm_id, slug, label, mode, duration_minutes, price_centavos) values
    ('00000000-0000-4000-c000-0000000000e2', 'free', 'Free Call', 'phone', 15, 0),
    ('00000000-0000-4000-c000-0000000000e2', 'paid', 'Paid Consult', 'video', 30, 100000);"

node "$E2E/mock-paymongo.mjs" > "${TMPDIR:-/tmp}/e2e-mock.log" 2>&1 &
node "$E2E/mock-resend.mjs" > "${TMPDIR:-/tmp}/e2e-mock-resend.log" 2>&1 &
node "$E2E/mock-philsms.mjs" > "${TMPDIR:-/tmp}/e2e-mock-philsms.log" 2>&1 &
sleep 1

pw() { sed -n 's/.*share securely): //p'; }
export PARTNER_PW=$(node scripts/create-staff-user.mjs --firm harlow-reyes --email partner@harlow.test --role partner --first Pat --last Partner | pw)
export ADMIN_PW=$(node scripts/create-staff-user.mjs --firm ui-firm --firm-name "UI Firm" --email admin@ui.test --role admin --first Ana --last Cruz | pw)
export ATTY_PW=$(node scripts/create-staff-user.mjs --firm ui-firm --email attorney@ui.test --role attorney | pw)
export CLIENT_PW="Client-Pass-123456"
node -e "
  const { createClient } = require('@supabase/supabase-js');
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    .auth.admin.createUser({ email: 'client@ui.test', password: process.env.CLIENT_PW, email_confirm: true })
    .then(({ error }) => { if (error) { console.error(error.message); process.exit(1); } });"
node scripts/paymongo-link-firm.mjs --firm harlow-reyes --account org_harlowtest --webhook-base https://example.test

if [ "${SKIP_BUILD:-}" != "1" ]; then
  npm run -s build > "${TMPDIR:-/tmp}/e2e-build.log" 2>&1 || { echo "Build failed:"; tail -30 "${TMPDIR:-/tmp}/e2e-build.log"; exit 1; }
fi
npx next start -p 3100 > "${TMPDIR:-/tmp}/e2e-next.log" 2>&1 &
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done

RC=0
run() { echo "=== $1"; node "$E2E/$1.e2e.mjs" || RC=1; }
# The booking suite books David Okafor's first open time; run it before payments, which
# expects the sample firm's other attorneys to still have open times.
case "$SUITE" in
  all) run booking; run payments; run staff-auth; run portal; run staff-dashboard; run firm-settings; run notifications; run reminders ;;
  booking|payments|staff-auth|portal|staff-dashboard|firm-settings|notifications|reminders) run "$SUITE" ;;
  *) echo "Unknown suite: $SUITE"; exit 2 ;;
esac

echo "--- server log (app lines)"
grep -iE "\[payments\]|\[booking\]|\[portal\]|\[staff\]|\[firm\]|\[invite\]|\[notify\]""${TMPDIR:-/tmp}/e2e-next.log" | head -20
exit $RC
