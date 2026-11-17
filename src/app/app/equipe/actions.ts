"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

function teamPath(rankaId?: string) {
  return z.uuid().safeParse(rankaId).success ? `/app/rankas/${rankaId}/configuracoes` : "/app/equipe";
}

export async function createTeamInvite(orgId: string, rankaId: string | undefined, previous: { link?: string; error?: string }, form: FormData): Promise<{ link?: string; error?: string }> {
  if (form.get("operation") !== "generate") return previous;
  const client = await createClient();
  await requireUserId({ client });
  if (!z.uuid().safeParse(orgId).success) return { error: "Equipe inválida." };
  const { data, error } = await client.rpc("create_open_team_invite", { p_org_id: orgId });
  if (error?.code === "PT409") return { error: "A equipe atingiu seu limite de vagas." };
  if (error || typeof data !== "string") return { error: "Não foi possível criar o convite. Confira seu acesso à organização." };
  revalidatePath("/app/equipe");
  if (rankaId) revalidatePath(teamPath(rankaId));
  return { link: new URL(`/convites/equipe/${data}`, siteUrl).href };
}

export async function removeTeamAccess(orgId: string, target: string, invite: boolean, rankaId?: string) {
  const client = await createClient();
  await requireUserId({ client });
  const path = teamPath(rankaId);
  const destination = (ok: boolean) => `${path}?${ok ? "equipe_sucesso" : "equipe_erro"}=1${rankaId ? "#equipe" : ""}`;
  if (!z.uuid().safeParse(orgId).success || !z.uuid().safeParse(target).success) redirect(destination(false));
  const { error } = await client.rpc("remove_team_access", { p_org_id: orgId, p_target: target, p_invite: invite });
  revalidatePath("/app/equipe");
  if (rankaId) revalidatePath(path);
  redirect(destination(!error));
}
