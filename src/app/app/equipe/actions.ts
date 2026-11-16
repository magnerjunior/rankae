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

export async function createTeamInvite(orgId: string, rankaId: string | undefined, _previous: { link?: string; error?: string }, form: FormData): Promise<{ link?: string; error?: string }> {
  const client = await createClient();
  await requireUserId({ client });
  const parsed = z.object({ orgId: z.uuid(), email: z.email().max(254) }).safeParse({ orgId, email: form.get("email") });
  if (!parsed.success) return { error: "Confira o e-mail do colaborador." };
  const { data, error } = await client.rpc("create_team_invite", { p_org_id: orgId, p_email: parsed.data.email });
  if (error?.code === "PT409") return { error: "A equipe atingiu seu limite ou esse e-mail já tem acesso." };
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
