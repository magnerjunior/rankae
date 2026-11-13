import { notFound, redirect } from "next/navigation";
import { TrustRepository } from "@/data/supabase/trust-repository";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function requirePlatformAdmin() {
  if (!hasSupabaseConfig()) notFound();
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/admin");
  const capability = await new TrustRepository(client).adminCapability();
  if (!capability.active) notFound();
  if (!capability.aal2) redirect("/admin");
  return client;
}
