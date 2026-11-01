#!/usr/bin/env node
/**
 * Creates (or promotes) a staff account. Use it to bootstrap the first admin, or to add
 * staff until the admin UI ships.
 *
 *   node --env-file=.env.local scripts/create-staff-user.mjs \
 *     --email jane@firm.ph --role admin [--first Jane --last Reyes] [--attorney jane-reyes]
 *
 * Roles: attorney | partner | admin. --attorney links the account to an attorneys.slug.
 * New accounts get a random temporary password, printed once. On first login the user
 * must enroll an authenticator app.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    role: { type: "string" },
    first: { type: "string", default: "" },
    last: { type: "string", default: "" },
    attorney: { type: "string" },
  },
});

const ROLES = ["attorney", "partner", "admin"];
if (!values.email || !ROLES.includes(values.role ?? "")) {
  console.error("Usage: --email <email> --role <attorney|partner|admin> [--first] [--last] [--attorney <slug>]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = values.email.trim().toLowerCase();

// Find an existing user by email (paginated listing; fine for firm-sized user counts).
async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match || data.users.length < 200) return match ?? null;
  }
}

let user = await findUser();
let tempPassword = null;
if (!user) {
  // Meets the 12+ chars, upper/lower/digit policy.
  tempPassword = `Tmp-${randomBytes(12).toString("base64url")}9a`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
  if (error) throw error;
  user = data.user;
}

const { error: profileError } = await supabase
  .from("profiles")
  .update({ role: values.role, first_name: values.first, last_name: values.last })
  .eq("id", user.id);
if (profileError) throw profileError;

if (values.attorney) {
  const { error } = await supabase.from("attorneys").update({ profile_id: user.id }).eq("slug", values.attorney);
  if (error) throw error;
}

await supabase.from("audit_log").insert({
  action: "staff.provisioned",
  entity: "profiles",
  entity_id: user.id,
  details: { role: values.role, attorney: values.attorney ?? null, via: "create-staff-user script" },
});

console.log(`✔ ${email} is now "${values.role}".`);
if (tempPassword) console.log(`  Temporary password (shown once, share securely): ${tempPassword}`);
console.log("  On first login they will be asked to set up an authenticator app.");
