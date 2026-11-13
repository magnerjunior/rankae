"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { portalCookieName } from "@/server/public-portal";
import { requireUserId } from "@/server/auth";

const schema = z.object({
  yellow: z.array(z.string()),
  red: z.array(z.string()),
  goals: z.array(z.object({ ms: z.coerce.number(), side: z.enum(["yellow", "red"]), name: z.string().nullable(), kind: z.string().nullable() })),
});
export type MatchDetails = z.infer<typeof schema>;

export async function getPublicMatchDetails(slug: string, matchId: string, internal: boolean): Promise<MatchDetails | null> {
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || !z.string().uuid().safeParse(matchId).success) return null;
  const client = await createClient();
  if (internal) await requireUserId({ client });
  const grant = internal ? null : (await cookies()).get(portalCookieName(slug))?.value ?? null;
  const { data, error } = await client.rpc("get_ranka_match_details", { p_slug: slug, p_match_id: matchId, p_grant_token: grant, p_internal: internal });
  const parsed = schema.safeParse(data);
  return !error && parsed.success ? parsed.data : null;
}
