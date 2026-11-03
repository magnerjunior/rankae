"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const playerSchema = z.object({ fullName: z.string().trim().min(2).max(120), nickname: z.string().trim().max(60).optional(), aliases: z.string().max(240).optional(), role: z.enum(["line", "keeper", "either"]) });

export async function createPlayerAction(rankaId: string, orgId: string, formData: FormData) {
  await requireUserId();
  const parsed = playerSchema.safeParse({ fullName: formData.get("fullName"), nickname: formData.get("nickname") || undefined, aliases: formData.get("aliases") || undefined, role: formData.get("role") });
  if (!parsed.success) redirect(`/app/rankas/${rankaId}/jogadores?erro=dados`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_player_with_aliases", { p_org_id: orgId, p_full_name: parsed.data.fullName, p_nickname: parsed.data.nickname ?? null, p_role: parsed.data.role, p_aliases: parsed.data.aliases?.split(",").map((alias) => alias.trim()).filter(Boolean) ?? [] });
  if (error) redirect(`/app/rankas/${rankaId}/jogadores?erro=salvar`);
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/jogadores?sucesso=1`);
}

export async function checkInPlayerAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  await requireUserId();
  const playerId = z.string().uuid().safeParse(formData.get("playerId"));
  if (!playerId.success) redirect(`/app/rankas/${rankaId}/chegada?erro=dados`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_in_player", { p_session_id: sessionId, p_player_id: playerId.data, p_expected_revision: expectedRevision, p_idempotency_key: randomUUID() });
  if (error) redirect(`/app/rankas/${rankaId}/chegada?erro=conflito`);
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/chegada?sucesso=1`);
}
