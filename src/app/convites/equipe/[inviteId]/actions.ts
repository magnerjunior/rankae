"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { adminAuthConfigured, createAdminAuthClient } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";

export type InviteResponse = { error?: string };
const unavailable = "Este convite já foi usado, expirou ou foi cancelado. Peça um novo link ao organizador.";

export async function joinTeam(inviteId: string, _previous: InviteResponse, form: FormData): Promise<InviteResponse> {
  if (!z.uuid().safeParse(inviteId).success) return { error: unavailable };
  const client = await createClient();
  const { data: open } = await client.rpc("team_invite_open", { p_invite: inviteId });
  if (open !== true) return { error: unavailable };
  const mode = form.get("mode");
  if (mode === "accept") {
    const { data, error } = await client.rpc("accept_team_invite", { p_invite: inviteId });
    if (error || !data) return { error: "Não foi possível aceitar o convite com a conta atual." };
    redirect(data.needsPassword ? "/redefinir-senha?convite=1" : "/app");
  }
  const credentials = z.object({ email: z.email().max(254), password: z.string().min(8).max(72) })
    .safeParse({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: form.get("password") });
  if (!credentials.success) return { error: "Confira o e-mail e a senha de, pelo menos, oito caracteres." };
  if (mode === "sign_in") {
    const { error: signInError } = await client.auth.signInWithPassword(credentials.data);
    if (signInError) return { error: "Confira o e-mail e a senha da sua conta." };
    const { error } = await client.rpc("accept_team_invite", { p_invite: inviteId });
    if (error) return { error: "Não foi possível aceitar o convite com essa conta. Confira o link com o organizador." };
    redirect("/app");
  }
  if (mode !== "register") return { error: "Escolha como entrar na equipe." };
  const name = z.string().trim().min(1).max(80).safeParse(form.get("name"));
  if (!name.success || form.get("confirmPassword") !== credentials.data.password) return { error: "Confira o nome e repita a mesma senha." };
  if (!adminAuthConfigured()) return { error: "O cadastro por convite está indisponível neste ambiente." };
  const { error } = await createAdminAuthClient().auth.admin.createUser({
    ...credentials.data, email_confirm: true,
    user_metadata: { name: name.data, full_name: name.data },
    app_metadata: { rankae_team_only: true, rankae_team_invite: inviteId },
  });
  if (error) {
    const duplicate = ["email_exists", "user_already_exists"].includes(error.code ?? "");
    return { error: duplicate ? "Esse e-mail já tem conta. Use Já tenho conta." : "Não foi possível usar o convite. Confira o link com o organizador." };
  }
  const { error: signInError } = await client.auth.signInWithPassword(credentials.data);
  redirect(signInError ? "/entrar" : "/app");
}
