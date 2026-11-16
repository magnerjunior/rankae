import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const errorResponse = z.object({ code: z.string() });

export async function provisionAccount(client: SupabaseClient, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke<unknown>("account-provisioning", { body });
  if (!error) return { data };
  if (error instanceof FunctionsHttpError) {
    const parsed = errorResponse.safeParse(await error.context.json().catch(() => null));
    if (parsed.success) return { error: parsed.data.code };
  }
  return { error: "unavailable" };
}
