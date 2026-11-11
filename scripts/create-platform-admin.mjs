#!/usr/bin/env node
/**
 * Makes an account one of our operators, who sign in at /admin.
 *
 *   npm run admin:create -- --email you@example.com [--first Ana --last Cruz]
 *   npm run admin:create -- --email you@example.com --remove
 *
 * An existing account (client or firm staff) keeps its password. A new account gets a random
 * temporary password, printed once. Operators must set up an authenticator app at first sign-in.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    first: { type: "string", default: "" },
    last: { type: "string", default: "" },
    remove: { type: "boolean", default: false },
  },
});
if (!values.email) {
  console.error("Usage: --email <email> [--first <name>] [--last <name>] [--remove]");
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

async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match || data.users.length < 200) return match ?? null;
  }
}

let user = await findUser();
if (values.remove) {
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }
  const { error } = await supabase.from("platform_admins").delete().eq("profile_id", user.id);
  if (error) throw error;
  console.log(`${email} is no longer an operator.`);
  process.exit(0);
}

let password = null;
if (!user) {
  // Meets the 12+ chars, upper/lower/digit policy.
  password = `Tmp-${randomBytes(12).toString("base64url")}9a`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
}
if (values.first || values.last) {
  const { error } = await supabase.from("profiles").update({ first_name: values.first, last_name: values.last }).eq("id", user.id);
  if (error) throw error;
}
const { error } = await supabase.from("platform_admins").upsert({ profile_id: user.id }, { onConflict: "profile_id" });
if (error) throw error;

console.log(`${email} is an operator. Sign in at /admin/login.`);
if (password) console.log(`Temporary password (share securely): ${password}`);
