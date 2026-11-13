"use server";

import { isRevisionConflict } from "@/lib/database-errors";
import { validInitialSelection } from "@/domain/initial-teams";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";
import { calculateContributionShare, canAcceptArrival } from "@/domain/ranka/rules";

const uuid = z.string().uuid();
const optionalUuid = z.preprocess((value) => value || undefined, uuid.optional());
import { scheduleSchema } from "@/domain/ranka/schedule";

const playerSchema = z.object({ fullName: z.string().trim().min(2).max(120), nickname: z.string().trim().max(60).optional(), phone: z.string().regex(/^\+?\d{8,15}$/).optional() });

export interface ArrivalActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface ArrivalItem {
  id: string;
  playerId: string;
  fullName: string;
  role: "line" | "keeper";
  arrivalIndex: number;
}

export interface ArrivalMutationResult {
  status: "success" | "error";
  message: string;
  revision?: number;
  arrivals?: ArrivalItem[];
}

export interface ClockMutationResult {
  status: "success" | "error";
  message?: string;
  state?: "draft" | "ready" | "live" | "paused" | "regulation_ended" | "overtime_live" | "overtime_paused" | "tie_break" | "completed" | "cancelled" | "manual_review";
  startedAtServer?: string;
  elapsedMsBeforeStart?: number;
  durationLimitMs?: number;
  revision?: number;
  serverNow?: string;
}

export interface TeamSwapMutationResult {
  status: "success" | "error";
  message: string;
  revision?: number;
}

export interface MatchEventMutationResult {
  status: "success" | "error";
  message: string;
  revision?: number;
}

export interface ContributionMutationResult {
  status: "success" | "error";
  message: string;
  revision?: number;
}

export interface FastMutationResult {
  status: "success" | "error";
  message: string;
  nextPath?: string;
}

export async function manageMatchPlayerAction(
  rankaId: string,
  sessionId: string,
  matchId: string,
  squadId: string,
  outgoingPlayerId: string,
  sessionRevision: number,
  matchRevision: number,
  formData: FormData,
) {
  const parsed = z.object({
    incomingPlayerId: optionalUuid,
    markLeft: z.boolean(),
  }).safeParse({
    incomingPlayerId: formData.get("incomingPlayerId"),
    markLeft: formData.get("markLeft") === "on",
  });
  if (!parsed.success || (!parsed.data.incomingPlayerId && !parsed.data.markLeft)) {
    finish(rankaId, "jogo", false, "troca");
  }
  const { error } = await rpc("manage_match_player", {
    p_session_id: sessionId,
    p_match_id: matchId,
    p_target_squad_id: squadId,
    p_outgoing_player_id: outgoingPlayerId,
    p_incoming_player_id: parsed.data.incomingPlayerId ?? null,
    p_mark_left: parsed.data.markLeft,
    p_expected_session_revision: sessionRevision,
    p_expected_match_revision: matchRevision,
    p_idempotency_key: idempotencyKey(formData),
  });
  finish(rankaId, "jogo", !error, error ? "conflito" : parsed.data.markLeft ? "saida" : "troca");
}

function readClockResult(data: unknown): ClockMutationResult | null {
  const parsed = z.object({
    state: z.enum(["draft", "ready", "live", "paused", "regulation_ended", "overtime_live", "overtime_paused", "tie_break", "completed", "cancelled", "manual_review"]),
    started_at_server: z.string().nullish(), elapsed_ms_before_start: z.coerce.number().nonnegative(), duration_limit_ms: z.coerce.number().nonnegative(), revision: z.coerce.number().int().positive(), server_now: z.string(),
  }).safeParse(data);
  if (!parsed.success) return null;
  return { status: "success", state: parsed.data.state, startedAtServer: parsed.data.started_at_server ?? undefined, elapsedMsBeforeStart: parsed.data.elapsed_ms_before_start, durationLimitMs: parsed.data.duration_limit_ms, revision: parsed.data.revision, serverNow: parsed.data.server_now };
}

const arrivalInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["line", "keeper"]),
});

function readArrivalResult(data: unknown): { revision?: number; arrivals?: ArrivalItem[] } {
  if (!data || typeof data !== "object") return {};
  const value = data as { session_revision?: unknown; arrivals?: unknown };
  const arrivals = z.array(z.object({
    id: z.string().uuid(), playerId: z.string().uuid(), fullName: z.string(),
    role: z.enum(["line", "keeper"]), arrivalIndex: z.number().int().positive(),
  })).safeParse(value.arrivals);
  return {
    revision: typeof value.session_revision === "number" ? value.session_revision : undefined,
    arrivals: arrivals.success ? arrivals.data : undefined,
  };
}

function arrivalError(code?: string): ArrivalMutationResult {
  if (code === "23514") return { status: "error", message: "O limite dessa posição foi atingido." };
  if (code === "23505") return { status: "error", message: "Há nomes iguais. Use também o sobrenome." };
  if (isRevisionConflict(code)) return { status: "error", message: "A lista mudou em outro aparelho. Atualize e tente novamente." };
  return { status: "error", message: "Não foi possível salvar agora. Tente novamente." };
}

function idempotencyKey(formData: FormData) {
  return uuid.safeParse(formData.get("idempotencyKey")).data ?? randomUUID();
}

function finish(rankaId: string, section: string, ok: boolean, code: string): never {
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/${section}?${ok ? "sucesso" : "erro"}=${code}`);
}

async function rpc(name: string, args: Record<string, unknown>) {
  await requireUserId();
  const supabase = await createClient();
  const startedAt = performance.now();
  const result = await supabase.rpc(name, args);
  if ([
    "record_match_event",
    "transition_match_clock",
    "generate_session_squads",
    "prepare_next_match",
    "complete_match_and_rotate",
    "batch_mark_contributions",
    "finish_ranka_session",
  ].includes(name)) {
    const statusCode = result.error ? isRevisionConflict(result.error.code) ? 409 : 500 : 200;
    await supabase.rpc("record_authenticated_route_outcome", {
      p_route_key: name,
      p_duration_ms: Math.round(performance.now() - startedAt),
      p_status_code: statusCode,
    });
  }
  return result;
}

export async function startRankaAction(rankaId: string) {
  const scheduledOn = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { error } = await rpc("start_ranka_session", { p_ranka_id: rankaId, p_scheduled_on: scheduledOn });
  if (error && error.code !== "PGRST202") finish(rankaId, "inicio", false, "iniciar");
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/chegada`);
}

export async function updateInactivityAlertAction(rankaId: string, expectedRevision: number, formData: FormData) {
  const months = z.coerce.number().int().min(1).max(24).safeParse(formData.get("months"));
  if (!months.success) finish(rankaId, "jogadores", false, "alerta");
  await requireUserId();
  const supabase = await createClient();
  const { data: ranka, error: readError } = await supabase.from("rankas").select("settings_json,revision").eq("id", rankaId).single();
  if (readError || !ranka || ranka.revision !== expectedRevision) finish(rankaId, "jogadores", false, "alerta");
  const settings = ranka.settings_json && typeof ranka.settings_json === "object" && !Array.isArray(ranka.settings_json) ? ranka.settings_json : {};
  const { data, error } = await supabase.from("rankas")
    .update({ settings_json: { ...settings, inactivityAlertMonths: months.data }, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
    .eq("id", rankaId).eq("revision", expectedRevision).select("id").maybeSingle();
  if (error || !data) finish(rankaId, "jogadores", false, "alerta");
  revalidatePath(`/app/rankas/${rankaId}/jogadores`);
  redirect(`/app/rankas/${rankaId}/jogadores?sucesso=alerta`);
}

export async function addArrivalAction(rankaId: string, sessionId: string, expectedRevision: number, _previous: ArrivalActionState, formData: FormData): Promise<ArrivalActionState> {
  const parsed = z.object({
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(["line", "keeper"]),
  }).safeParse({ fullName: formData.get("fullName"), role: formData.get("role") });
  if (!parsed.success) return { status: "error", message: "Digite o nome do jogador." };
  let { error } = await rpc("add_arrival_by_name", {
    p_session_id: sessionId,
    p_full_name: parsed.data.fullName,
    p_role: parsed.data.role,
    p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey(formData),
  });
  if (error?.code === "PGRST202") {
    const supabase = await createClient();
    const { data: session } = await supabase.from("sessions").select("org_id,rules_snapshot").eq("id", sessionId).single();
    if (!session) return { status: "error", message: "Não foi possível abrir a lista de chegada." };
    const [{ data: players }, { data: attendance }] = await Promise.all([
      supabase.from("players").select("id,full_name,role_preference").eq("org_id", session.org_id).eq("status", "active"),
      supabase.from("attendance").select("player_id,role_preference,status").eq("session_id", sessionId).eq("status", "present"),
    ]);
    const rules = (session.rules_snapshot ?? {}) as Record<string, unknown>;
    const sameRoleCount = (attendance ?? []).filter((entry) => entry.role_preference === parsed.data.role).length;
    const roleLimit = parsed.data.role === "keeper" ? Number(rules.maxKeepers ?? 3) : Number(rules.maxLinePlayers ?? 24);
    if (!canAcceptArrival(sameRoleCount, roleLimit)) return { status: "error", message: "O limite dessa posição foi atingido." };
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
    const exact = (players ?? []).filter((player) => normalize(player.full_name) === normalize(parsed.data.fullName));
    if (exact.length > 1) return { status: "error", message: "Há nomes iguais. Digite também o sobrenome." };
    if (exact[0] && (attendance ?? []).some((entry) => entry.player_id === exact[0].id)) return { status: "success", message: `${parsed.data.fullName} já estava na lista.` };
    let playerId = exact[0]?.id as string | undefined;
    if (!playerId) {
      const created = await supabase.rpc("create_player_with_aliases_confirmed", {
        p_org_id: session.org_id,
        p_full_name: parsed.data.fullName,
        p_nickname: null,
        p_role: parsed.data.role,
        p_aliases: [],
        p_confirm_possible_duplicate: false,
      });
      if (created.error || !created.data || typeof created.data !== "object" || !("id" in created.data)) return { status: "error", message: "Use um nome mais completo para evitar duplicidade." };
      playerId = String(created.data.id);
    } else if (exact[0].role_preference !== parsed.data.role) {
      await supabase.from("players").update({ role_preference: parsed.data.role }).eq("id", playerId);
    }
    const checked = await rpc("check_in_player", {
      p_session_id: sessionId,
      p_player_id: playerId,
      p_expected_revision: expectedRevision,
      p_idempotency_key: idempotencyKey(formData),
    });
    error = checked.error;
  }
  if (error) {
    if (error.code === "23514") return { status: "error", message: "O limite dessa posição foi atingido." };
    if (error.code === "23505") return { status: "error", message: "Há nomes iguais. Digite também o sobrenome." };
    if (isRevisionConflict(error.code)) return { status: "error", message: "A lista mudou. Atualizamos a tela; tente mais uma vez." };
    return { status: "error", message: "Não foi possível confirmar a chegada agora." };
  }
  revalidatePath(`/app/rankas/${rankaId}/chegada`);
  return { status: "success", message: `${parsed.data.fullName} chegou.` };
}

export async function addFastArrivalAction(sessionId: string, input: { fullName: string; role: "line" | "keeper"; expectedRevision: number; idempotencyKey: string }): Promise<ArrivalMutationResult> {
  const parsed = arrivalInputSchema.safeParse(input);
  const revision = z.number().int().positive().safeParse(input.expectedRevision);
  if (!parsed.success || !revision.success) return { status: "error", message: "Digite o nome do jogador." };
  const result = await rpc("bulk_add_arrivals", {
    p_session_id: sessionId,
    p_entries: [parsed.data],
    p_expected_revision: revision.data,
    p_idempotency_key: uuid.safeParse(input.idempotencyKey).data ?? randomUUID(),
  });
  if (result.error) return arrivalError(result.error.code);
  const output = readArrivalResult(result.data);
  return { status: "success", message: `${parsed.data.fullName} chegou.`, ...output };
}

export async function bulkAddArrivalsAction(sessionId: string, input: { entries: Array<{ fullName: string; role: "line" | "keeper" }>; expectedRevision: number; idempotencyKey: string }): Promise<ArrivalMutationResult> {
  const parsed = z.array(arrivalInputSchema).min(1).max(60).safeParse(input.entries);
  const revision = z.number().int().positive().safeParse(input.expectedRevision);
  if (!parsed.success || !revision.success) return { status: "error", message: "Revise a lista antes de confirmar." };
  const result = await rpc("bulk_add_arrivals", {
    p_session_id: sessionId,
    p_entries: parsed.data,
    p_expected_revision: revision.data,
    p_idempotency_key: uuid.safeParse(input.idempotencyKey).data ?? randomUUID(),
  });
  if (result.error) return arrivalError(result.error.code);
  const output = readArrivalResult(result.data);
  return { status: "success", message: `${parsed.data.length} jogadores adicionados.`, ...output };
}

export async function reorderArrivalAction(sessionId: string, input: { playerId: string; targetPosition: number; expectedRevision: number; idempotencyKey: string }): Promise<ArrivalMutationResult> {
  const parsed = z.object({ playerId: uuid, targetPosition: z.number().int().positive(), expectedRevision: z.number().int().positive(), idempotencyKey: uuid }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Não foi possível mudar essa posição." };
  const result = await rpc("reorder_session_arrival", {
    p_session_id: sessionId,
    p_player_id: parsed.data.playerId,
    p_target_position: parsed.data.targetPosition,
    p_expected_revision: parsed.data.expectedRevision,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (result.error) return arrivalError(result.error.code);
  return { status: "success", message: "Ordem atualizada.", ...readArrivalResult(result.data) };
}

export async function renameArrivalAction(sessionId: string, input: { playerId: string; fullName: string; expectedRevision: number; idempotencyKey: string }): Promise<ArrivalMutationResult> {
  const parsed = z.object({ playerId: uuid, fullName: z.string().trim().min(2).max(120), expectedRevision: z.number().int().positive(), idempotencyKey: uuid }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Digite um nome válido." };
  const result = await rpc("rename_arrival_player", {
    p_session_id: sessionId,
    p_player_id: parsed.data.playerId,
    p_full_name: parsed.data.fullName,
    p_expected_revision: parsed.data.expectedRevision,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (result.error) return arrivalError(result.error.code);
  const output = readArrivalResult(result.data);
  return { status: "success", message: "Nome atualizado.", revision: output.revision };
}

export async function removeArrivalAction(sessionId: string, input: { playerId: string; expectedRevision: number; idempotencyKey: string }): Promise<ArrivalMutationResult> {
  const parsed = z.object({ playerId: uuid, expectedRevision: z.number().int().positive(), idempotencyKey: uuid }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Não foi possível remover esse jogador." };
  const result = await rpc("set_attendance_status", {
    p_session_id: sessionId,
    p_player_id: parsed.data.playerId,
    p_status: "left",
    p_reason: "Removido da chegada",
    p_expected_revision: parsed.data.expectedRevision,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (result.error) return arrivalError(result.error.code);
  const output = readArrivalResult(result.data);
  return { status: "success", message: "Jogador removido.", revision: output.revision };
}

export async function startGameFromArrivalAction(rankaId: string, sessionId: string, squadSize: number, hasPersistedSquads: boolean, input: { expectedRevision: number }) {
  const parsedRevision = z.number().int().positive().safeParse(input.expectedRevision);
  if (!parsedRevision.success) finish(rankaId, "chegada", false, "revisao");
  if (!hasPersistedSquads) {
    const generated = await rpc("generate_session_squads", {
      p_session_id: sessionId,
      p_squad_size: squadSize,
      p_method: "shuffle_blocks",
      p_seed: randomBytes(4).readUInt32BE(0) % 2_147_483_647,
      p_expected_revision: parsedRevision.data,
      p_idempotency_key: randomUUID(),
    });
    if (generated.error) finish(rankaId, "chegada", false, "times");
  }
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/jogo?etapa=times`);
}

export async function createPlayerAction(rankaId: string, orgId: string, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim().replace(/[\s().-]/g, "");
  const parsed = playerSchema.safeParse({ fullName: formData.get("fullName"), nickname: formData.get("nickname") || undefined, phone: phone || undefined });
  if (!parsed.success) finish(rankaId, "jogadores", false, "dados");
  const { error } = await rpc("create_player_profile", { p_org_id: orgId, p_full_name: parsed.data.fullName, p_nickname: parsed.data.nickname ?? null, p_phone: parsed.data.phone ?? null, p_confirm_possible_duplicate: formData.get("confirmPossibleDuplicate") === "on", p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogadores", !error, error ? "salvar" : "jogador");
}

export async function payPendingContributionAction(rankaId: string, sessionId: string, playerId: string, revision: number, formData: FormData) {
  const { error } = await rpc("pay_ranka_pending_contribution", { p_ranka_id: rankaId, p_session_id: sessionId, p_player_id: playerId, p_expected_revision: revision, p_idempotency_key: idempotencyKey(formData) });
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/jogadores?filtro=pendentes&${error ? "erro" : "sucesso"}=contribuicao`);
}

export async function saveRankaScheduleAction(rankaId: string, revision: number, formData: FormData) {
  const parsed = scheduleSchema.safeParse({ mode: formData.get("mode"), date: formData.get("date"), weekdays: [...new Set(formData.getAll("weekdays").map(Number))], alternateDay: Number(formData.get("alternateDay")) });
  if (!parsed.success) finish(rankaId, "configuracoes", false, "agenda");
  const schedule = parsed.data;
  const { error } = await rpc("update_ranka_schedule", { p_ranka_id: rankaId, p_expected_revision: revision, p_idempotency_key: idempotencyKey(formData), p_mode: schedule.mode, p_date: "date" in schedule ? schedule.date : null, p_weekdays: schedule.mode === "weekly" ? schedule.weekdays : null, p_alternate_day: schedule.mode === "alternating" ? schedule.alternateDay : null });
  finish(rankaId, "configuracoes", !error, "agenda");
}

export async function setPlayerMembershipAction(rankaId: string, playerId: string, formData: FormData) {
  const membership = z.enum(["regular", "guest"]).safeParse(formData.get("membership"));
  if (!membership.success) finish(rankaId, "jogadores", false, "vinculo");
  const { error } = await rpc("set_player_membership", { p_player_id: playerId, p_membership: membership.data, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogadores", !error, error ? "vinculo" : "vinculo");
}

export async function checkInPlayerAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const playerId = uuid.safeParse(formData.get("playerId"));
  if (!playerId.success) finish(rankaId, "chegada", false, "dados");
  const { error } = await rpc("check_in_player", { p_session_id: sessionId, p_player_id: playerId.data, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "chegada", !error, error ? "conflito" : "chegada");
}

export async function setAttendanceStatusAction(rankaId: string, sessionId: string, playerId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ status: z.enum(["present", "temporarily_out", "left", "no_show", "inactive"]), reason: z.string().trim().max(240).optional() }).safeParse({ status: formData.get("status"), reason: formData.get("reason") || undefined });
  if (!parsed.success) finish(rankaId, "chegada", false, "dados");
  const { error } = await rpc("set_attendance_status", { p_session_id: sessionId, p_player_id: playerId, p_status: parsed.data.status, p_reason: parsed.data.reason ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "chegada", !error, error ? "conflito" : "status");
}

export async function generateSquadsAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ squadSize: z.coerce.number().int().min(2).max(12), method: z.enum(["sequential", "shuffle_blocks", "manual"]), seed: z.coerce.number().int().optional() }).safeParse({ squadSize: formData.get("squadSize"), method: formData.get("method"), seed: formData.get("seed") || undefined });
  if (!parsed.success) finish(rankaId, "jogo", false, "dados");
  if (parsed.data.method === "manual" && !validInitialSelection(formData.getAll("manualPlayers").map(String), parsed.data.squadSize)) finish(rankaId, "jogo", false, "dados");
  const seed = parsed.data.method === "shuffle_blocks" ? parsed.data.seed ?? randomBytes(4).readUInt32BE(0) % 2_147_483_647 : null;
  const { error } = await rpc("generate_initial_squads", { p_manual_players: formData.getAll("manualPlayers"), p_yellow_number: Number(formData.get("yellowNumber") || 1), p_session_id: sessionId, p_squad_size: parsed.data.squadSize, p_method: parsed.data.method, p_seed: seed, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogo", !error, error ? "conflito" : "times");
}

export async function substitutePlayerAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ targetSquadId: uuid, outgoingPlayerId: uuid, incomingPlayerId: uuid, reason: z.string().trim().min(3).max(240), override: z.coerce.boolean().default(false) }).safeParse({ targetSquadId: formData.get("targetSquadId"), outgoingPlayerId: formData.get("outgoingPlayerId"), incomingPlayerId: formData.get("incomingPlayerId"), reason: formData.get("reason"), override: formData.get("override") === "on" });
  if (!parsed.success) finish(rankaId, "jogo", false, "dados");
  const { error } = await rpc("substitute_squad_member", { p_session_id: sessionId, p_target_squad_id: parsed.data.targetSquadId, p_outgoing_player_id: parsed.data.outgoingPlayerId, p_incoming_player_id: parsed.data.incomingPlayerId, p_reason: parsed.data.reason, p_override_priority: parsed.data.override, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogo", !error, error ? "conflito" : "substituicao");
}

export async function swapSquadPlayersAction(rankaId: string, sessionId: string, formData: FormData): Promise<TeamSwapMutationResult> {
  const parsed = z.object({
    firstSquadId: uuid,
    firstPlayerId: uuid,
    secondSquadId: uuid,
    secondPlayerId: uuid,
    expectedRevision: z.coerce.number().int().positive(),
  }).safeParse({
    firstSquadId: formData.get("firstSquadId"),
    firstPlayerId: formData.get("firstPlayerId"),
    secondSquadId: formData.get("secondSquadId"),
    secondPlayerId: formData.get("secondPlayerId"),
    expectedRevision: formData.get("expectedRevision"),
  });
  if (!parsed.success) return { status: "error", message: "Não foi possível identificar os jogadores." };
  const { data, error } = await rpc("swap_squad_players", {
    p_session_id: sessionId,
    p_first_squad_id: parsed.data.firstSquadId,
    p_first_player_id: parsed.data.firstPlayerId,
    p_second_squad_id: parsed.data.secondSquadId,
    p_second_player_id: parsed.data.secondPlayerId,
    p_expected_revision: parsed.data.expectedRevision,
    p_idempotency_key: idempotencyKey(formData),
  });
  if (error) {
    const message = isRevisionConflict(error.code)
      ? "Os times mudaram em outro aparelho. Atualize e tente novamente."
      : error.code === "55000"
        ? "Volte à formação dos times antes de preparar a partida."
        : "Não foi possível trocar agora. Tente novamente.";
    return { status: "error", message };
  }
  const result = z.object({ session_revision: z.coerce.number().int().positive() }).safeParse(data);
  revalidatePath(`/app/rankas/${rankaId}`);
  return { status: "success", message: "Times atualizados.", revision: result.success ? result.data.session_revision : undefined };
}

export async function prepareMatchAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData): Promise<FastMutationResult> {
  const { error } = await rpc("prepare_next_match", { p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "Os times mudaram em outro aparelho. Tente novamente." : "Não foi possível preparar a partida." };
  revalidatePath(`/app/rankas/${rankaId}`);
  return { status: "success", message: "Pré-jogo pronto.", nextPath: `/app/rankas/${rankaId}/jogo?etapa=partida` };
}

export async function confirmOfficialsAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ yellowKeeperId: optionalUuid, redKeeperId: optionalUuid, ballBoyIds: z.array(uuid).max(2) }).safeParse({ yellowKeeperId: formData.get("yellowKeeperId"), redKeeperId: formData.get("redKeeperId"), ballBoyIds: formData.getAll("ballBoyIds") });
  if (!parsed.success) finish(rankaId, "jogo", false, "escala");
  const { error } = await rpc("confirm_match_officials", { p_match_id: matchId, p_yellow_keeper_id: parsed.data.yellowKeeperId ?? null, p_red_keeper_id: parsed.data.redKeeperId ?? null, p_ball_boy_ids: parsed.data.ballBoyIds, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogo", !error, error ? "conflito" : "escala");
}

export async function clockAction(rankaId: string, matchId: string, command: string, formData: FormData): Promise<ClockMutationResult> {
  const parsed = z.enum(["start", "pause", "resume", "reset", "finish_regulation", "start_overtime", "finish_overtime"]).safeParse(command);
  const revision = z.coerce.number().int().positive().safeParse(formData.get("expectedRevision"));
  if (!parsed.success || !revision.success) return { status: "error", message: "Não foi possível atualizar o relógio." };
  const desiredStates: Record<typeof parsed.data, string[]> = { start: ["live"], pause: ["paused", "overtime_paused"], resume: ["live", "overtime_live"], reset: ["ready"], finish_regulation: ["regulation_ended"], start_overtime: ["overtime_live"], finish_overtime: ["tie_break"] };
  let result = await rpc("transition_match_clock", { p_match_id: matchId, p_command: parsed.data, p_expected_revision: revision.data, p_idempotency_key: idempotencyKey(formData) });
  if (isRevisionConflict(result.error?.code)) {
    const current = await rpc("get_match_clock_snapshot", { p_match_id: matchId });
    const currentClock = readClockResult(current.data);
    if (currentClock?.state && desiredStates[parsed.data].includes(currentClock.state)) return currentClock;
    if (currentClock?.revision) result = await rpc("transition_match_clock", { p_match_id: matchId, p_command: parsed.data, p_expected_revision: currentClock.revision, p_idempotency_key: randomUUID() });
  }
  if (result.error) return { status: "error", message: "O relógio não foi alterado. Tente novamente." };
  const clock = readClockResult(result.data);
  if (!clock) return { status: "error", message: "Não foi possível confirmar o horário." };
  revalidatePath(`/app/rankas/${rankaId}`);
  return clock;
}

export async function clockNavigationAction(rankaId: string, matchId: string, command: string, formData: FormData): Promise<void> {
  const result = await clockAction(rankaId, matchId, command, formData);
  if (result.status === "error") finish(rankaId, "jogo", false, "relogio");
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/jogo?etapa=partida`);
}

export async function finishRankaSessionAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const { error } = await rpc("finish_ranka_session", { p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) finish(rankaId, "jogo", false, "encerrar_ranka");
  revalidatePath(`/app/rankas/${rankaId}`);
  redirect(`/app/rankas/${rankaId}/estatisticas?period=last&sucesso=ranka_encerrado`);
}

export async function recordEventAction(matchId: string, expectedRevision: number, formData: FormData): Promise<FastMutationResult> {
  const parsed = z.object({ eventType: z.enum(["goal", "penalty_attempt", "marker"]), side: z.preprocess((value) => value || undefined, z.enum(["yellow", "red"]).optional()), scorerPlayerId: optionalUuid, assistPlayerId: optionalUuid, keeperPlayerId: optionalUuid, goalKind: z.preprocess((value) => value || undefined, z.enum(["normal", "penalty", "own_goal"]).optional()), penaltyOutcome: z.preprocess((value) => value || undefined, z.enum(["converted", "missed", "saved"]).optional()), label: z.string().trim().max(80).optional(), markerKind: z.enum(["note", "card"]).default("note"), cardColor: z.enum(["yellow", "red", "blue"]).optional(), cardMinutes: z.coerce.number().int().min(0).max(30).optional(), cardPlayerId: optionalUuid }).safeParse({ eventType: formData.get("eventType"), side: formData.get("side"), scorerPlayerId: formData.get("scorerPlayerId"), assistPlayerId: formData.get("assistPlayerId"), keeperPlayerId: formData.get("keeperPlayerId"), goalKind: formData.get("goalKind"), penaltyOutcome: formData.get("penaltyOutcome"), label: formData.get("label") || undefined, markerKind: formData.get("markerKind") || "note", cardColor: formData.get("cardColor") || undefined, cardMinutes: formData.get("cardMinutes") || undefined, cardPlayerId: formData.get("cardPlayerId") });
  if (!parsed.success) return { status: "error", message: "Revise os dados do evento." };
  if (parsed.data.eventType === "goal" && parsed.data.scorerPlayerId && parsed.data.scorerPlayerId === parsed.data.assistPlayerId) return { status: "error", message: "Quem marcou não pode receber a assistência." };
  const cardPlayer = parsed.data.cardPlayerId && parsed.data.markerKind === "card" ? parsed.data.cardPlayerId : undefined;
  let cardPlayerName: string | undefined;
  if (cardPlayer) {
    const supabase = await createClient();
    const { data } = await supabase.from("players").select("full_name").eq("id", cardPlayer).maybeSingle();
    cardPlayerName = typeof data?.full_name === "string" ? data.full_name : undefined;
  }
  const colorLabel = parsed.data.cardColor === "red" ? "vermelho" : parsed.data.cardColor === "blue" ? "azul" : "amarelo";
  const markerLabel = parsed.data.markerKind === "card"
    ? `Cartão ${colorLabel}${cardPlayerName ? ` · ${cardPlayerName}` : ""}${parsed.data.cardMinutes ? ` · ${parsed.data.cardMinutes} min fora` : ""}`
    : parsed.data.label || "Marco";
  const metadata = parsed.data.markerKind === "card" ? { kind: "card", color: parsed.data.cardColor, durationMinutes: parsed.data.cardMinutes, playerId: cardPlayer } : { kind: "note" };
  const { error } = await rpc("record_match_event", { p_match_id: matchId, p_event_type: parsed.data.eventType, p_side: parsed.data.side ?? null, p_scorer_player_id: cardPlayer ?? parsed.data.scorerPlayerId ?? null, p_assist_player_id: parsed.data.assistPlayerId ?? null, p_keeper_player_id: parsed.data.keeperPlayerId ?? null, p_goal_kind: parsed.data.goalKind ?? null, p_penalty_outcome: parsed.data.penaltyOutcome ?? null, p_label: parsed.data.eventType === "marker" ? markerLabel.slice(0, 80) : parsed.data.label ?? null, p_metadata: metadata, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "A partida mudou em outro aparelho. Tente novamente." : "Não foi possível registrar o evento." };
  return { status: "success", message: parsed.data.eventType === "marker" ? "Ocorrência registrada." : "Evento registrado." };
}

export async function recordGoalFastAction(matchId: string, expectedRevision: number, formData: FormData): Promise<MatchEventMutationResult> {
  const parsed = z.object({
    side: z.enum(["yellow", "red"]),
    scorerPlayerId: optionalUuid,
    assistPlayerId: optionalUuid,
    goalKind: z.enum(["normal", "penalty", "own_goal"]),
  }).safeParse({
    side: formData.get("side"),
    scorerPlayerId: formData.get("scorerPlayerId"),
    assistPlayerId: formData.get("assistPlayerId"),
    goalKind: formData.get("goalKind"),
  });
  if (!parsed.success) return { status: "error", message: "Revise os dados do gol." };
  if (parsed.data.scorerPlayerId && parsed.data.scorerPlayerId === parsed.data.assistPlayerId) {
    return { status: "error", message: "Quem marcou não pode receber a assistência." };
  }
  const key = idempotencyKey(formData);
  const args = (revision: number) => ({
    p_match_id: matchId,
    p_event_type: "goal",
    p_side: parsed.data.side,
    p_scorer_player_id: parsed.data.scorerPlayerId ?? null,
    p_assist_player_id: parsed.data.assistPlayerId ?? null,
    p_keeper_player_id: null,
    p_goal_kind: parsed.data.goalKind,
    p_penalty_outcome: null,
    p_label: null,
    p_metadata: {},
    p_expected_revision: revision,
    p_idempotency_key: key,
  });
  let result = await rpc("record_match_event", args(expectedRevision));
  if (isRevisionConflict(result.error?.code)) {
    const current = await rpc("get_match_clock_snapshot", { p_match_id: matchId });
    const clock = readClockResult(current.data);
    if (clock?.revision) result = await rpc("record_match_event", args(clock.revision));
  }
  if (result.error) {
    return { status: "error", message: result.error.code === "55000" ? "A partida não aceita gols neste momento." : "O gol não foi confirmado. Tente novamente." };
  }
  const output = z.object({ match_revision: z.coerce.number().int().positive() }).safeParse(result.data);
  return { status: "success", message: "Gol confirmado.", revision: output.success ? output.data.match_revision : undefined };
}

export async function voidEventAction(rankaId: string, eventId: string, expectedRevision: number, formData: FormData) {
  const reason = z.string().trim().min(3).max(240).safeParse(formData.get("reason"));
  if (!reason.success) finish(rankaId, "jogo", false, "motivo");
  const { error } = await rpc("void_match_event", { p_event_id: eventId, p_reason: reason.data, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogo", !error, error ? "conflito" : "correcao");
}

export async function updateMarkerAction(rankaId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ eventId: uuid, label: z.string().trim().min(1).max(80) }).safeParse({ eventId: formData.get("eventId"), label: formData.get("label") });
  if (!parsed.success) finish(rankaId, "jogo", false, "rotulo");
  const { error } = await rpc("update_match_marker", { p_event_id: parsed.data.eventId, p_label: parsed.data.label, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogo", !error, error ? "conflito" : "marco");
}

export async function resolveTieAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ method: z.enum(["penalties", "odd_even", "both_out", "manual"]), winnerSquadId: optionalUuid }).safeParse({ method: formData.get("method"), winnerSquadId: formData.get("winnerSquadId") });
  if (!parsed.success) finish(rankaId, "jogo", false, "desempate");
  const { error } = await rpc("resolve_match_tie", { p_match_id: matchId, p_method: parsed.data.method, p_winner_squad_id: parsed.data.winnerSquadId ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "jogo", !error, error ? "conflito" : "desempate");
}

export async function completeMatchAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData): Promise<FastMutationResult> {
  const parsed = z.object({ resultOverride: z.preprocess((value) => value || undefined, z.enum(["yellow", "red", "both_out"]).optional()), reason: z.string().trim().max(240).optional() }).safeParse({ resultOverride: formData.get("resultOverride"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { status: "error", message: "Revise o resultado antes de continuar." };
  const { error } = await rpc("complete_match_and_rotate", { p_match_id: matchId, p_result_override: parsed.data.resultOverride ?? null, p_reason: parsed.data.reason ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "A partida foi alterada em outro aparelho. Tente novamente." : "Não foi possível abrir o próximo jogo." };
  revalidatePath(`/app/rankas/${rankaId}`);
  return { status: "success", message: "Próximo jogo pronto.", nextPath: `/app/rankas/${rankaId}/jogo?etapa=partida` };
}

export async function finishMatchAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData): Promise<FastMutationResult> {
  const { error } = await rpc("finish_match", { p_match_id: matchId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "A partida mudou em outro aparelho. Atualize e tente novamente." : "Não foi possível encerrar a partida." };
  revalidatePath(`/app/rankas/${rankaId}`);
  return { status: "success", message: "Partida encerrada." };
}

export async function adjustMatchClockAction(rankaId: string, matchId: string, formData: FormData): Promise<ClockMutationResult> {
  const parsed = z.object({ minutes: z.coerce.number().int().min(1).max(10), revision: z.coerce.number().int().positive() }).safeParse({ minutes: formData.get("minutes"), revision: formData.get("expectedRevision") });
  if (!parsed.success) return { status: "error", message: "Escolha de 1 a 10 minutos." };
  const { data, error } = await rpc("adjust_match_clock", { p_match_id: matchId, p_add_ms: parsed.data.minutes * 60_000, p_expected_revision: parsed.data.revision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: "Não foi possível adicionar tempo. Atualize e tente novamente." };
  const clock = readClockResult(data);
  if (!clock) return { status: "error", message: "Não foi possível confirmar o novo tempo." };
  revalidatePath(`/app/rankas/${rankaId}`);
  return clock;
}

export async function updateGoalAttributionAction(rankaId: string, eventId: string, matchRevision: number, formData: FormData): Promise<FastMutationResult> {
  const parsed = z.object({ scorer: optionalUuid, assist: optionalUuid }).safeParse({ scorer: formData.get("scorer"), assist: formData.get("assist") });
  if (!parsed.success || (parsed.data.scorer && parsed.data.scorer === parsed.data.assist)) return { status: "error", message: "Confira autor e assistência." };
  const { error } = await rpc("update_goal_attribution", { p_event_id: eventId, p_scorer_player_id: parsed.data.scorer ?? null, p_assist_player_id: parsed.data.assist ?? null, p_expected_revision: matchRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "A partida mudou. Atualize e tente novamente." : "Não foi possível atribuir o gol." };
  revalidatePath(`/app/rankas/${rankaId}`);
  return { status: "success", message: "Autoria atualizada." };
}

export async function editHistoricalGoalAction(rankaId: string, sessionId: string, eventId: string, matchRevision: number, formData: FormData) {
  const parsed = z.object({
    side: z.enum(["yellow", "red"]),
    goalKind: z.enum(["normal", "penalty", "own_goal"]),
    minute: z.coerce.number().int().min(0).max(1440),
    second: z.coerce.number().int().min(0).max(59),
    scorer: optionalUuid,
    assist: optionalUuid,
  }).safeParse({ side: formData.get("side"), goalKind: formData.get("goalKind"), minute: formData.get("minute"), second: formData.get("second"), scorer: formData.get("scorer"), assist: formData.get("assist") });
  if (!parsed.success || (parsed.data.scorer && parsed.data.scorer === parsed.data.assist)) finishHistory(rankaId, sessionId, false);
  const occurrenceMs = parsed.data.minute * 60_000 + parsed.data.second * 1_000;
  const { error } = await rpc("edit_match_goal", {
    p_event_id: eventId,
    p_side: parsed.data.side,
    p_goal_kind: parsed.data.goalKind,
    p_occurrence_ms: occurrenceMs,
    p_scorer_player_id: parsed.data.scorer ?? null,
    p_assist_player_id: parsed.data.assist ?? null,
    p_expected_revision: matchRevision,
    p_idempotency_key: idempotencyKey(formData),
  });
  finishHistory(rankaId, sessionId, !error);
}

export async function voidHistoricalMatchEventAction(rankaId: string, sessionId: string, eventId: string, matchRevision: number, formData: FormData) {
  const reason = z.string().trim().min(3).max(240).safeParse(formData.get("reason"));
  if (!reason.success) finishHistory(rankaId, sessionId, false);
  const { error } = await rpc("void_match_event", { p_event_id: eventId, p_reason: reason.data, p_expected_revision: matchRevision, p_idempotency_key: idempotencyKey(formData) });
  finishHistory(rankaId, sessionId, !error);
}

function finishHistory(rankaId: string, sessionId: string, ok: boolean): never {
  revalidatePath(`/app/rankas/${rankaId}/historico`);
  redirect(`/app/rankas/${rankaId}/historico?dia=${sessionId}&${ok ? "sucesso" : "erro"}=correcao`);
}

export async function batchContributionsAction(sessionId: string, expectedRevision: number, formData: FormData): Promise<ContributionMutationResult> {
  const parsed = z.object({ playerIds: z.array(uuid).min(1), status: z.enum(["pending", "paid", "waived"]), note: z.string().trim().max(240).optional() }).safeParse({ playerIds: formData.getAll("playerIds"), status: formData.get("status"), note: formData.get("note") || undefined });
  if (!parsed.success) return { status: "error", message: "Selecione ao menos um jogador." };
  const { data, error } = await rpc("batch_mark_contributions", { p_session_id: sessionId, p_player_ids: parsed.data.playerIds, p_status: parsed.data.status, p_note: parsed.data.note ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "A lista mudou em outro aparelho. Atualize e tente novamente." : "Não foi possível atualizar as contribuições." };
  const output = z.object({ session_revision: z.coerce.number().int().positive() }).safeParse(data);
  revalidatePath(`/app/rankas`);
  return { status: "success", message: `${parsed.data.playerIds.length} contribuição(ões) atualizada(s).`, revision: output.success ? output.data.session_revision : undefined };
}

export async function setKeeperWaiverAction(rankaId: string, sessionId: string, expectedRevision: number, enabled: boolean): Promise<ContributionMutationResult> {
  const { data, error } = await rpc("set_session_keeper_waiver", { p_session_id: sessionId, p_enabled: enabled, p_expected_revision: expectedRevision, p_idempotency_key: randomUUID() });
  if (error) return { status: "error", message: isRevisionConflict(error.code) ? "A rodada mudou em outro aparelho. Atualize e tente novamente." : "Não foi possível atualizar a isenção dos goleiros." };
  const output = z.object({ session_revision: z.coerce.number().int().positive() }).safeParse(data);
  revalidatePath(`/app/rankas/${rankaId}`);
  return { status: "success", message: enabled ? "Goleiros isentos nesta rodada." : "Isenção dos goleiros removida." , revision: output.success ? output.data.session_revision : undefined };
}

export async function updateRulesAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const moneyToCents = (value: FormDataEntryValue | null) => {
    const normalized = String(value ?? "0").trim().replace(/\./g, "").replace(",", ".");
    const number = Number(normalized);
    return Number.isFinite(number) ? Math.round(number * 100) : Number.NaN;
  };
  const parsed = z.object({ squadSize: z.coerce.number().int().min(2).max(12), maxLinePlayers: z.coerce.number().int().min(2).max(120), maxKeepers: z.coerce.number().int().min(0).max(20), regulationMinutes: z.coerce.number().int().min(1).max(120), overtimeMinutes: z.coerce.number().int().min(0).max(30), targetGoals: z.coerce.number().int().min(0).max(99), targetGoalDifference: z.coerce.number().int().min(0).max(99), tiePolicy: z.enum(["overtime", "both_out", "penalties", "odd_even", "manual"]), contributionMode: z.enum(["fixed", "divide_total"]), contributionAmountCents: z.number().int().min(0).max(1_000_000), totalCostCents: z.number().int().min(0).max(10_000_000) }).safeParse({ squadSize: formData.get("squadSize"), maxLinePlayers: formData.get("maxLinePlayers"), maxKeepers: formData.get("maxKeepers"), regulationMinutes: formData.get("regulationMinutes"), overtimeMinutes: formData.get("overtimeMinutes"), targetGoals: formData.get("enableTargetGoals") === "on" ? formData.get("targetGoals") : 0, targetGoalDifference: formData.get("enableGoalDifference") === "on" ? formData.get("targetGoalDifference") : 0, tiePolicy: formData.get("tiePolicy"), contributionMode: formData.get("contributionMode"), contributionAmountCents: moneyToCents(formData.get("contributionAmount")), totalCostCents: moneyToCents(formData.get("totalCost")) });
  if (!parsed.success) finish(rankaId, "configuracoes", false, "dados");
  const presentCount = Math.max(1, Number(formData.get("presentCount") ?? 1));
  const contributionAmountCents = calculateContributionShare({ mode: parsed.data.contributionMode, fixedCents: parsed.data.contributionAmountCents, totalCents: parsed.data.totalCostCents, presentCount });
  const rules = { squadSize: parsed.data.squadSize, maxLinePlayers: parsed.data.maxLinePlayers, maxKeepers: parsed.data.maxKeepers, regulationDurationMs: parsed.data.regulationMinutes * 60_000, overtimeDurationMs: parsed.data.overtimeMinutes * 60_000, targetGoals: parsed.data.targetGoals, targetGoalsConfigured: true, targetGoalDifference: parsed.data.targetGoalDifference, tiePolicy: parsed.data.tiePolicy, contributionMode: parsed.data.contributionMode, totalCostCents: parsed.data.totalCostCents };
  const { error } = await rpc("update_session_rules", { p_session_id: sessionId, p_rules: rules, p_contribution_amount_cents: contributionAmountCents, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "configuracoes", !error, error ? "conflito" : "regras");
}

export interface PortalSettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
  sharePath?: string;
}

export async function configurePortalAction(rankaId: string, slug: string, _previous: PortalSettingsActionState, formData: FormData): Promise<PortalSettingsActionState> {
  const parsed = z.object({
    visibility: z.enum(["public", "unlisted", "pin_protected", "private_off"]),
    pin: z.preprocess((value) => value || undefined, z.string().regex(/^\d{4}$/).optional()),
  }).safeParse({ visibility: formData.get("visibility"), pin: formData.get("pin") });
  if (!parsed.success || (parsed.data.visibility === "pin_protected" && !parsed.data.pin)) {
    return { status: "error", message: "Revise o modo de acesso e informe exatamente quatro dígitos para o PIN." };
  }
  const protectedMode = parsed.data.visibility === "unlisted" || parsed.data.visibility === "pin_protected";
  const linkToken = protectedMode ? randomBytes(32).toString("base64url") : null;
  const { error } = await rpc("configure_public_portal", {
    p_ranka_id: rankaId,
    p_visibility: parsed.data.visibility,
    p_pin: parsed.data.pin ?? null,
    p_link_token: linkToken,
  });
  if (error) return { status: "error", message: "Não foi possível atualizar o portal. Tente novamente sem reutilizar o link anterior." };
  revalidatePath(`/app/rankas/${rankaId}`);
  revalidatePath(`/r/${slug}`);
  return {
    status: "success",
    message: protectedMode ? "Novo link protegido gerado. Links anteriores foram revogados." : parsed.data.visibility === "public" ? "Portal público ativado." : "Portal público desativado.",
    sharePath: linkToken ? `/r/${slug}?token=${encodeURIComponent(linkToken)}` : parsed.data.visibility === "public" ? `/r/${slug}` : undefined,
  };
}

export async function setPlayerPublicProfileAction(rankaId: string, playerId: string, formData: FormData) {
  const parsed = z.object({ visible: z.boolean(), displayName: z.string().trim().max(80).optional() }).safeParse({
    visible: formData.get("visible") === "on",
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success || (parsed.data.visible && (!parsed.data.displayName || parsed.data.displayName.length < 2))) finish(rankaId, "configuracoes", false, "perfil_publico");
  const { error } = await rpc("set_player_public_profile", { p_player_id: playerId, p_visible: parsed.data.visible, p_display_name: parsed.data.displayName ?? null });
  finish(rankaId, "configuracoes", !error, error ? "perfil_publico" : "perfil_publico");
}
