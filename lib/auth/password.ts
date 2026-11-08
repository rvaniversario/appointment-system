import { z } from "zod";

/** Mirrors the Supabase Auth password policy; 72 is the bcrypt limit Supabase enforces. */
export const newPasswordSchema = z.string().min(12).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/);
export const PASSWORD_POLICY_ERROR =
  "Use 12 to 72 characters with at least one uppercase letter, one lowercase letter and one number.";
