import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const trialAccessSchema = z.object({ remaining: z.number().int().nonnegative(), daysLeft: z.number().int().nonnegative(), ended: z.boolean(), canStart: z.boolean(), canPlayToday: z.boolean() });
export type TrialAccess = z.infer<typeof trialAccessSchema>;

export async function getAccountTrial(client: SupabaseClient, rankaId?: string): Promise<TrialAccess | undefined> {
  const { data, error } = await client.rpc("get_account_trial", rankaId ? { p_ranka_id: rankaId } : {});
  if (error?.code === "42501" || error?.code === "PGRST202") return undefined;
  if (error) throw new Error("Não foi possível consultar o acesso ao teste.");
  return data == null ? undefined : trialAccessSchema.parse(data);
}
