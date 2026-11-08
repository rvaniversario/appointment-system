#!/usr/bin/env node
/**
 * Adds a staff account to a firm. Use it to bootstrap a firm's first admin, or to add
 * staff until the admin UI ships.
 *
 *   node --env-file=.env.local scripts/create-staff-user.mjs \
 *     --firm santos-law --firm-name "Santos Law Office" --email jane@firm.ph --role admin \
 *     [--first Jane --last Reyes] [--attorney jane-reyes]
 *
 * --firm is the firm's slug. --firm-name creates the firm if that slug doesn't exist yet.
 * Staff belong to one firm, so an account that already works for another firm is refused.
 * Roles: attorney | partner | admin. --attorney links the account to an attorney's slug in
 * this firm. New accounts get a random temporary password, printed once. On first login the user
 * must enroll an authenticator app.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    firm: { type: "string" },
    "firm-name": { type: "string" },
    email: { type: "string" },
    role: { type: "string" },
    first: { type: "string", default: "" },
    last: { type: "string", default: "" },
    attorney: { type: "string" },
  },
});

const ROLES = ["attorney", "partner", "admin"];
if (!values.firm || !values.email || !ROLES.includes(values.role ?? "")) {
  console.error(
    'Usage: --firm <slug> [--firm-name "<name>"] --email <email> --role <attorney|partner|admin> [--first] [--last] [--attorney <slug>]',
  );
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

// Find an existing user by email (paginated listing; fine at the current user counts).
async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match || data.users.length < 200) return match ?? null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function findOrCreateFirm() {
  const { data: existing, error } = await supabase.from("firms").select("id").eq("slug", values.firm).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  if (!values["firm-name"]) fail(`No firm with slug "${values.firm}". Pass --firm-name to create it.`);

  const { data: created, error: createError } = await supabase
    .from("firms")
    .insert({ slug: values.firm, name: values["firm-name"], status: "active" })
    .select("id")
    .single();
  if (createError) throw createError;
  return created;
}

const firm = await findOrCreateFirm();

let user = await findUser();
if (user) {
  const { data: membership, error } = await supabase
    .from("firm_memberships")
    .select("firm_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (membership && membership.firm_id !== firm.id) fail(`${email} already works for another firm.`);
}

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
  .update({ first_name: values.first, last_name: values.last })
  .eq("id", user.id);
if (profileError) throw profileError;

const { error: membershipError } = await supabase
  .from("firm_memberships")
  .upsert({ profile_id: user.id, firm_id: firm.id, role: values.role });
if (membershipError) throw membershipError;

if (values.attorney) {
  const { data: linked, error } = await supabase
    .from("attorneys")
    .update({ profile_id: user.id })
    .eq("firm_id", firm.id)
    .eq("slug", values.attorney)
    .select("id");
  if (error) throw error;
  if (linked.length === 0) fail(`No attorney with slug "${values.attorney}" in this firm.`);
}

await supabase.from("audit_log").insert({
  firm_id: firm.id,
  action: "staff.provisioned",
  entity: "profiles",
  entity_id: user.id,
  details: { role: values.role, attorney: values.attorney ?? null, via: "create-staff-user script" },
});

console.log(`✔ ${email} is now "${values.role}" at ${values.firm}.`);
if (tempPassword) console.log(`  Temporary password (shown once, share securely): ${tempPassword}`);
console.log("  On first login they will be asked to set up an authenticator app.");
