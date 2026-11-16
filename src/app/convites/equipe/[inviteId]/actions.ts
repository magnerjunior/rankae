"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/site-url";
import { adminAuthConfigured, createAdminAuthClient } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";

export type InviteResponse = { sent?: boolean; error?: string };
const deliverySchema = z.object({ email: z.email(), exists: z.boolean() });
const unavailable = "Este convite venceu ou foi cancelado. Peça um novo link ao organizador.";

export async function joinTeam(inviteId: string, previous: InviteResponse, form: FormData): Promise<InviteResponse> {
  if (!z.uuid().safeParse(inviteId).success) return { error: unavailable };
  const intent = form.get("intent");
  if (intent !== "accept" && intent !== "request" && intent !== "verify") return { error: "Confira a ação do convite." };
  const client = await createClient();
  if (intent !== "accept") {
    if (!adminAuthConfigured()) return { sent: previous.sent, error: "O e-mail de confirmação está indisponível. Fale com o suporte." };
    const token = z.string().trim().regex(/^\d{6,10}$/).safeParse(form.get("code"));
    if (intent === "verify" && !token.success) return { sent: true, error: "Confira o código informado." };
    const admin = createAdminAuthClient();
    const { data, error } = await admin.rpc("team_invite_delivery", { p_invite: inviteId, p_request_code: intent === "request" });
    if (error?.code === "PT429") return { sent: previous.sent, error: "Aguarde um minuto para pedir outro e-mail." };
    if (error) return { sent: previous.sent, error: "Não foi possível consultar o convite agora. Tente novamente." };
    const delivery = deliverySchema.safeParse(data);
    if (!delivery.success) return { error: unavailable };
    const { email, exists } = delivery.data;
    if (intent === "request") {
      if (!exists) {
        const created = await admin.auth.admin.createUser({ email, email_confirm: false, app_metadata: { rankae_team_only: true } });
        if (created.error && !["email_exists", "user_already_exists"].includes(created.error.code ?? "")) return { error: "Não foi possível preparar o acesso. Tente novamente." };
      }
      const callback = new URL("/auth/callback", siteUrl);
      callback.searchParams.set("equipe", inviteId);
      const result = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: callback.href } });
      return result.error ? { sent: previous.sent, error: "Não foi possível enviar o e-mail de confirmação. Tente novamente." } : { sent: true };
    }
    if (token.success) {
      const result = await client.auth.verifyOtp({ email, token: token.data, type: "email" });
      if (result.error) return { sent: true, error: "Código inválido ou vencido. Confira ou peça outro e-mail." };
    }
  }
  const { data, error } = await client.rpc("accept_team_invite", { p_invite: inviteId });
  if (error?.code === "PT404") return { error: unavailable };
  if (error?.code === "42501" || error?.code === "PGRST202") return { sent: previous.sent, error: "Confirme o e-mail que recebeu o convite para entrar na equipe." };
  if (error || !data) return { sent: previous.sent, error: "Não foi possível entrar na equipe. Confirme a vaga com o organizador." };
  redirect(data.needsPassword ? "/redefinir-senha?convite=1" : "/app");
}
