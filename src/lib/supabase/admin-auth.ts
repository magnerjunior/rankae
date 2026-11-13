import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function adminAuthConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminAuthClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Credencial de provisionamento indisponível.");
  return createClient(getSupabaseConfig().url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
