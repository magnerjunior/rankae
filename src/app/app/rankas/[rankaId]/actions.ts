"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const uuid = z.string().uuid();
const optionalUuid = z.preprocess((value) => value || undefined, uuid.optional());
const playerSchema = z.object({ fullName: z.string().trim().min(2).max(120), nickname: z.string().trim().max(60).optional(), aliases: z.string().max(240).optional(), role: z.enum(["line", "keeper", "either"]) });

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
  return supabase.rpc(name, args);
}

export async function createPlayerAction(rankaId: string, orgId: string, formData: FormData) {
  const parsed = playerSchema.safeParse({ fullName: formData.get("fullName"), nickname: formData.get("nickname") || undefined, aliases: formData.get("aliases") || undefined, role: formData.get("role") });
  if (!parsed.success) finish(rankaId, "jogadores", false, "dados");
  const { error } = await rpc("create_player_with_aliases_confirmed", { p_org_id: orgId, p_full_name: parsed.data.fullName, p_nickname: parsed.data.nickname ?? null, p_role: parsed.data.role, p_aliases: parsed.data.aliases?.split(",").map((alias) => alias.trim()).filter(Boolean) ?? [], p_confirm_possible_duplicate: formData.get("confirmPossibleDuplicate") === "on" });
  finish(rankaId, "jogadores", !error, error ? "salvar" : "jogador");
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
  const parsed = z.object({ squadSize: z.coerce.number().int().min(2).max(12), method: z.enum(["sequential", "shuffle_blocks"]), seed: z.coerce.number().int().optional() }).safeParse({ squadSize: formData.get("squadSize"), method: formData.get("method"), seed: formData.get("seed") || undefined });
  if (!parsed.success) finish(rankaId, "times", false, "dados");
  const { error } = await rpc("generate_session_squads", { p_session_id: sessionId, p_squad_size: parsed.data.squadSize, p_method: parsed.data.method, p_seed: parsed.data.seed ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "times", !error, error ? "conflito" : "times");
}

export async function substitutePlayerAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ targetSquadId: uuid, outgoingPlayerId: uuid, incomingPlayerId: uuid, reason: z.string().trim().min(3).max(240), override: z.coerce.boolean().default(false) }).safeParse({ targetSquadId: formData.get("targetSquadId"), outgoingPlayerId: formData.get("outgoingPlayerId"), incomingPlayerId: formData.get("incomingPlayerId"), reason: formData.get("reason"), override: formData.get("override") === "on" });
  if (!parsed.success) finish(rankaId, "times", false, "dados");
  const { error } = await rpc("substitute_squad_member", { p_session_id: sessionId, p_target_squad_id: parsed.data.targetSquadId, p_outgoing_player_id: parsed.data.outgoingPlayerId, p_incoming_player_id: parsed.data.incomingPlayerId, p_reason: parsed.data.reason, p_override_priority: parsed.data.override, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "times", !error, error ? "conflito" : "substituicao");
}

export async function prepareMatchAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const { error } = await rpc("prepare_next_match", { p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "preparar" : "pre_jogo");
}

export async function confirmOfficialsAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ yellowKeeperId: optionalUuid, redKeeperId: optionalUuid, ballBoyIds: z.array(uuid).max(2) }).safeParse({ yellowKeeperId: formData.get("yellowKeeperId"), redKeeperId: formData.get("redKeeperId"), ballBoyIds: formData.getAll("ballBoyIds") });
  if (!parsed.success) finish(rankaId, "partida", false, "escala");
  const { error } = await rpc("confirm_match_officials", { p_match_id: matchId, p_yellow_keeper_id: parsed.data.yellowKeeperId ?? null, p_red_keeper_id: parsed.data.redKeeperId ?? null, p_ball_boy_ids: parsed.data.ballBoyIds, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "conflito" : "escala");
}

export async function clockAction(rankaId: string, matchId: string, expectedRevision: number, command: string, formData: FormData) {
  const parsed = z.enum(["start", "pause", "resume", "reset", "finish_regulation", "start_overtime", "finish_overtime"]).safeParse(command);
  if (!parsed.success) finish(rankaId, "partida", false, "comando");
  const { error } = await rpc("transition_match_clock", { p_match_id: matchId, p_command: parsed.data, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "conflito" : parsed.data);
}

export async function recordEventAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ eventType: z.enum(["goal", "penalty_attempt", "marker"]), side: z.preprocess((value) => value || undefined, z.enum(["yellow", "red"]).optional()), scorerPlayerId: optionalUuid, assistPlayerId: optionalUuid, keeperPlayerId: optionalUuid, goalKind: z.preprocess((value) => value || undefined, z.enum(["normal", "penalty", "own_goal"]).optional()), penaltyOutcome: z.preprocess((value) => value || undefined, z.enum(["converted", "missed", "saved"]).optional()), label: z.string().trim().max(80).optional() }).safeParse({ eventType: formData.get("eventType"), side: formData.get("side"), scorerPlayerId: formData.get("scorerPlayerId"), assistPlayerId: formData.get("assistPlayerId"), keeperPlayerId: formData.get("keeperPlayerId"), goalKind: formData.get("goalKind"), penaltyOutcome: formData.get("penaltyOutcome"), label: formData.get("label") || undefined });
  if (!parsed.success) finish(rankaId, "partida", false, "evento");
  const { error } = await rpc("record_match_event", { p_match_id: matchId, p_event_type: parsed.data.eventType, p_side: parsed.data.side ?? null, p_scorer_player_id: parsed.data.scorerPlayerId ?? null, p_assist_player_id: parsed.data.assistPlayerId ?? null, p_keeper_player_id: parsed.data.keeperPlayerId ?? null, p_goal_kind: parsed.data.goalKind ?? null, p_penalty_outcome: parsed.data.penaltyOutcome ?? null, p_label: parsed.data.label ?? null, p_metadata: {}, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "conflito" : "evento");
}

export async function voidEventAction(rankaId: string, eventId: string, expectedRevision: number, formData: FormData) {
  const reason = z.string().trim().min(3).max(240).safeParse(formData.get("reason"));
  if (!reason.success) finish(rankaId, "partida", false, "motivo");
  const { error } = await rpc("void_match_event", { p_event_id: eventId, p_reason: reason.data, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "conflito" : "correcao");
}

export async function resolveTieAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ method: z.enum(["penalties", "odd_even", "both_out", "manual"]), winnerSquadId: optionalUuid }).safeParse({ method: formData.get("method"), winnerSquadId: formData.get("winnerSquadId") });
  if (!parsed.success) finish(rankaId, "partida", false, "desempate");
  const { error } = await rpc("resolve_match_tie", { p_match_id: matchId, p_method: parsed.data.method, p_winner_squad_id: parsed.data.winnerSquadId ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "conflito" : "desempate");
}

export async function completeMatchAction(rankaId: string, matchId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ resultOverride: z.preprocess((value) => value || undefined, z.enum(["yellow", "red", "both_out"]).optional()), reason: z.string().trim().max(240).optional() }).safeParse({ resultOverride: formData.get("resultOverride"), reason: formData.get("reason") || undefined });
  if (!parsed.success) finish(rankaId, "partida", false, "rotacao");
  const { error } = await rpc("complete_match_and_rotate", { p_match_id: matchId, p_result_override: parsed.data.resultOverride ?? null, p_reason: parsed.data.reason ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "partida", !error, error ? "conflito" : "rotacao");
}

export async function batchContributionsAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ playerIds: z.array(uuid).min(1), status: z.enum(["pending", "paid", "waived"]), note: z.string().trim().max(240).optional() }).safeParse({ playerIds: formData.getAll("playerIds"), status: formData.get("status"), note: formData.get("note") || undefined });
  if (!parsed.success) finish(rankaId, "contribuicoes", false, "selecao");
  const { error } = await rpc("batch_mark_contributions", { p_session_id: sessionId, p_player_ids: parsed.data.playerIds, p_status: parsed.data.status, p_note: parsed.data.note ?? null, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
  finish(rankaId, "contribuicoes", !error, error ? "conflito" : "lote");
}

export async function updateRulesAction(rankaId: string, sessionId: string, expectedRevision: number, formData: FormData) {
  const parsed = z.object({ squadSize: z.coerce.number().int().min(2).max(12), regulationMinutes: z.coerce.number().int().min(1).max(120), overtimeMinutes: z.coerce.number().int().min(0).max(30), targetGoals: z.coerce.number().int().min(0).max(99), targetGoalDifference: z.coerce.number().int().min(0).max(99), tiePolicy: z.enum(["overtime", "both_out", "penalties", "odd_even", "manual"]), contributionAmountCents: z.coerce.number().int().min(0).max(1_000_000) }).safeParse({ squadSize: formData.get("squadSize"), regulationMinutes: formData.get("regulationMinutes"), overtimeMinutes: formData.get("overtimeMinutes"), targetGoals: formData.get("targetGoals"), targetGoalDifference: formData.get("targetGoalDifference"), tiePolicy: formData.get("tiePolicy"), contributionAmountCents: formData.get("contributionAmountCents") });
  if (!parsed.success) finish(rankaId, "configuracoes", false, "dados");
  const rules = { squadSize: parsed.data.squadSize, regulationDurationMs: parsed.data.regulationMinutes * 60_000, overtimeDurationMs: parsed.data.overtimeMinutes * 60_000, targetGoals: parsed.data.targetGoals, targetGoalDifference: parsed.data.targetGoalDifference, tiePolicy: parsed.data.tiePolicy };
  const { error } = await rpc("update_session_rules", { p_session_id: sessionId, p_rules: rules, p_contribution_amount_cents: parsed.data.contributionAmountCents, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey(formData) });
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
