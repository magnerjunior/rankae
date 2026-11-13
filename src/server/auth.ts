import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function requireUserId(options: { allowPendingLegal?: boolean; client?: Awaited<ReturnType<typeof createClient>> } = {}): Promise<string> {
  if (!hasSupabaseConfig()) redirect("/entrar");
  const supabase = options.client ?? await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") redirect("/entrar");
  if (!options.allowPendingLegal) {
    const { data: pending, error: legalError } = await supabase.rpc("get_pending_legal_documents");
    if (legalError && legalError.code !== "PGRST202") throw new Error("Não foi possível verificar os aceites obrigatórios.");
    if (Array.isArray(pending) && pending.length > 0) redirect("/app/legal");
  }
  return userId;
}
