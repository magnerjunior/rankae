"use server";

import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { requireUserId } from "@/server/auth";

type CourtResponse = { error?: string; message?: string; link?: string; pin?: string };

export async function shareCourtDay(sessionId: string, _previous: CourtResponse, form: FormData): Promise<CourtResponse> {
  if (!z.uuid().safeParse(sessionId).success) return { error: "Encontro indisponível." };
  const client = await createClient();
  await requireUserId({ client });
  const revoke = form.get("mode") === "revoke";
  const pin = revoke ? null : String(randomInt(0, 10_000)).padStart(4, "0");
  const { data, error } = await client.rpc("configure_court_access", { p_session: sessionId, p_pin: pin });
  if (error) return { error: "O dono do ranka pode compartilhar um encontro em aberto." };
  if (!pin) return { message: "Acesso por link revogado." };
  if (!z.uuid().safeParse(data).success) return { error: "Não foi possível criar o acesso." };
  return { link: new URL(`/quadra/${data}`, siteUrl).href, pin };
}

export async function unlockCourtDay(linkId: string, _previous: CourtResponse, form: FormData): Promise<CourtResponse> {
  const pin = z.string().regex(/^\d{4}$/).safeParse(form.get("pin"));
  if (!pin.success || !z.uuid().safeParse(linkId).success) return { error: "Digite o PIN de quatro dígitos." };
  const token = randomBytes(32).toString("base64url");
  const client = await createClient();
  const { data } = await client.rpc("unlock_court_access", { p_link: linkId, p_pin: pin.data, p_device_token: token });
  if (data !== true) return { error: "PIN ou link inválido. Se fez várias tentativas, aguarde dez minutos." };
  (await cookies()).set("rankae-court-device", token, {
    path: `/quadra/${linkId}`, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 86_400,
  });
  revalidatePath(`/quadra/${linkId}`);
  return { message: "Acesso liberado." };
}

const commandSchema = z.enum(["arrival","order","draw","prepare","start","pause","resume","goal","finish","next"]);

export async function runCourtCommand(linkId: string, _previous: CourtResponse, form: FormData): Promise<CourtResponse> {
  const command = commandSchema.safeParse(form.get("command"));
  const revision = z.coerce.number().int().positive().safeParse(form.get("revision"));
  if (!z.uuid().safeParse(linkId).success || !command.success || !revision.success) return { error: "Confira os dados da operação." };
  const token = (await cookies()).get("rankae-court-device")?.value;
  if (!token) return { error: "Abra o link e informe o PIN para continuar." };
  let data: Record<string, unknown> = {};
  if (command.data === "arrival") {
    const name = z.string().trim().min(2).max(120).safeParse(form.get("name"));
    const role = z.enum(["line","keeper"]).safeParse(form.get("role"));
    if (!name.success || !role.success) return { error: "Confira o nome e a posição do jogador." };
    data = { name: name.data, role: role.data };
  } else if (command.data === "order") {
    const player = z.uuid().safeParse(form.get("player"));
    const position = z.coerce.number().int().min(1).max(150).safeParse(form.get("position"));
    if (!player.success || !position.success) return { error: "Confira a posição na fila." };
    data = { player: player.data, position: position.data };
  } else if (command.data === "draw") {
    const method = z.enum(["shuffle_blocks","pairs","all","sequential"]).safeParse(form.get("method"));
    if (!method.success) return { error: "Selecione um modo de sorteio." };
    data = { method: method.data };
  } else if (command.data === "goal") {
    const side = z.enum(["yellow","red"]).safeParse(form.get("side"));
    if (!side.success) return { error: "Escolha um lado para marcar o gol." };
    data = { side: side.data };
  } else if (command.data === "next" && form.get("outcome")) {
    const outcome = z.enum(["yellow","red","both_out"]).safeParse(form.get("outcome"));
    if (!outcome.success) return { error: "Confira o resultado do desempate." };
    data = { outcome: outcome.data };
  }
  const client = await createClient();
  const { error } = await client.rpc("court_day_command", { p_link: linkId, p_token: token, p_command: command.data, p_data: data, p_revision: revision.data, p_key: randomUUID() });
  revalidatePath(`/quadra/${linkId}`);
  if (error) return { error: error.code === "42501" ? "Este acesso expirou ou foi revogado." : "O jogo ou a fila mudou. Confira a tela e tente novamente." };
  return { message: "Atualizado." };
}
