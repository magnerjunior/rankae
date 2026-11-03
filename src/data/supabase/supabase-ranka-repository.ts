import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { groupSquads } from "@/domain/ranka/rules";
import type { Attendance, MatchEvent, Player, Squad } from "@/domain/ranka/types";
import type { LiveMatch, MatchAssignment, RankaRepository, RankaSnapshot, SessionRules, SessionSummary } from "@/data/ports/ranka-repository";

const sessionSummarySchema = z.object({
  matches: z.coerce.number().int().nonnegative(),
  topTeam: z.object({ number: z.coerce.number().int(), label: z.string().optional(), wins: z.coerce.number().int(), players: z.array(z.string()) }).nullish(),
  bottomTeam: z.object({ number: z.coerce.number().int(), label: z.string().optional(), losses: z.coerce.number().int(), players: z.array(z.string()) }).nullish(),
  topScorer: z.object({ name: z.string(), total: z.coerce.number().int() }).nullish(),
  topAssist: z.object({ name: z.string(), total: z.coerce.number().int() }).nullish(),
  bestKeeper: z.object({ name: z.string(), conceded: z.coerce.number().int(), matches: z.coerce.number().int() }).nullish(),
  worstKeeper: z.object({ name: z.string(), conceded: z.coerce.number().int(), matches: z.coerce.number().int() }).nullish(),
});

interface RankaRow { id: string; org_id: string; name: string; slug: string; visibility: "public" | "unlisted" | "pin_protected" | "private_off"; invite_token_hash: string | null; }
interface SessionRow { id: string; scheduled_on: string; state: RankaSnapshot["sessionState"]; revision: number; rules_snapshot: Record<string, unknown>; contribution_amount_cents: number; }
interface PlayerRow { id: string; full_name: string; nickname: string | null; role_preference: "line" | "keeper" | "either"; membership_status: "regular" | "guest"; public_visible: boolean; public_display_name: string | null; player_aliases?: { alias: string }[]; }
interface AttendanceRow { id: string; player_id: string; arrival_index: number; status: Attendance["status"]; role_preference: "line" | "keeper" | "either"; }
interface SquadRow { id: string; squad_number: number; state: "waiting" | "field" | "resting" | "archived"; squad_members?: { player_id: string; assignment_order: number; removed_at: string | null }[]; }
interface MatchRow {
  id: string; ordinal: number; yellow_squad_id: string; red_squad_id: string; state: LiveMatch["state"];
  clock_phase: LiveMatch["clockPhase"]; started_at_server: string | null; elapsed_ms_before_start: number;
  duration_limit_ms: number; regulation_duration_ms: number; overtime_duration_ms: number; revision: number;
}
interface AssignmentRow { id: string; player_id: string; squad_id: string | null; field_side: MatchAssignment["side"] | null; role: MatchAssignment["role"]; }
interface EventRow {
  id: string; event_type: MatchEvent["type"]; side: MatchEvent["side"] | null; scorer_player_id: string | null;
  assist_player_id: string | null; keeper_player_id: string | null; goal_kind: MatchEvent["goalKind"] | null;
  penalty_outcome: MatchEvent["penaltyOutcome"] | null; occurrence_ms: number; status: MatchEvent["status"]; label: string | null;
}
interface ContributionRow { player_id: string; amount_cents: number; status: "pending" | "paid" | "waived"; }

function readRules(value: Record<string, unknown>): SessionRules {
  const squadSize = Number(value.squadSize ?? 6);
  const maxLinePlayers = Number(value.maxLinePlayers ?? 24);
  const maxKeepers = Number(value.maxKeepers ?? 3);
  const regulationDurationMs = Number(value.regulationDurationMs ?? 420_000);
  const overtimeDurationMs = Number(value.overtimeDurationMs ?? 180_000);
  const targetGoals = Number(value.targetGoals ?? 0);
  const targetGoalDifference = Number(value.targetGoalDifference ?? 0);
  const tiePolicy = value.tiePolicy;
  const contributionMode = value.contributionMode === "divide_total" ? "divide_total" : "fixed";
  const totalCostCents = Number(value.totalCostCents ?? 0);
  return {
    squadSize: Number.isInteger(squadSize) && squadSize >= 2 ? squadSize : 6,
    maxLinePlayers: Number.isInteger(maxLinePlayers) && maxLinePlayers >= 2 ? maxLinePlayers : 24,
    maxKeepers: Number.isInteger(maxKeepers) && maxKeepers >= 0 ? maxKeepers : 3,
    regulationDurationMs: Number.isInteger(regulationDurationMs) ? regulationDurationMs : 420_000,
    overtimeDurationMs: Number.isInteger(overtimeDurationMs) ? overtimeDurationMs : 180_000,
    targetGoals: Number.isInteger(targetGoals) && targetGoals >= 0 ? targetGoals : 0,
    targetGoalDifference: Number.isInteger(targetGoalDifference) && targetGoalDifference >= 0 ? targetGoalDifference : 0,
    tiePolicy: tiePolicy === "both_out" || tiePolicy === "penalties" || tiePolicy === "odd_even" || tiePolicy === "manual" ? tiePolicy : "overtime",
    contributionMode,
    totalCostCents: Number.isInteger(totalCostCents) && totalCostCents >= 0 ? totalCostCents : 0,
  };
}

export class RankaNotFoundError extends Error {
  constructor() {
    super("Ranka não encontrado ou não autorizado.");
    this.name = "RankaNotFoundError";
  }
}

function queryFailure(context: string, code?: string): Error {
  return new Error(`${context}${code ? ` (${code})` : ""}`);
}

export class SupabaseRankaRepository implements RankaRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSnapshot(rankaId: string): Promise<RankaSnapshot> {
    const { data: ranka, error: rankaError } = await this.client.from("rankas").select("id,org_id,name,slug,visibility,invite_token_hash").eq("id", rankaId).maybeSingle();
    if (rankaError) throw queryFailure("Não foi possível consultar o ranka", rankaError.code);
    if (!ranka) throw new RankaNotFoundError();
    const typedRanka = ranka as RankaRow;
    const [{ data: sessions, error: sessionError }, { data: playerRows, error: playersError }] = await Promise.all([
      this.client.from("sessions").select("id,scheduled_on,state,revision,rules_snapshot,contribution_amount_cents").eq("ranka_id", rankaId).order("scheduled_on", { ascending: false }).limit(1),
      this.client.from("players").select("id,full_name,nickname,role_preference,membership_status,public_visible,public_display_name,player_aliases!player_aliases_player_id_fkey(alias)").eq("org_id", typedRanka.org_id).eq("status", "active").order("normalized_name"),
    ]);
    if (sessionError) throw queryFailure("Não foi possível carregar a sessão autorizada", sessionError.code);
    if (playersError) throw queryFailure("Não foi possível carregar os jogadores", playersError.code);
    const session = (sessions?.[0] ?? null) as SessionRow | null;
    if (!session) throw new Error("Este ranka ainda não possui sessão.");

    const [attendanceResult, squadsResult, matchResult, contributionsResult] = await Promise.all([
      this.client.from("attendance").select("id,player_id,arrival_index,status,role_preference").eq("session_id", session.id).order("arrival_index"),
      this.client.from("squads").select("id,squad_number,state,squad_members(player_id,assignment_order,removed_at)").eq("session_id", session.id).neq("state", "archived").order("squad_number"),
      this.client.from("matches").select("id,ordinal,yellow_squad_id,red_squad_id,state,clock_phase,started_at_server,elapsed_ms_before_start,duration_limit_ms,regulation_duration_ms,overtime_duration_ms,revision").eq("session_id", session.id).order("ordinal", { ascending: false }).limit(1),
      this.client.from("contribution_records").select("player_id,amount_cents,status").eq("session_id", session.id),
    ]);
    if (attendanceResult.error) throw queryFailure("Não foi possível carregar a chegada", attendanceResult.error.code);
    if (squadsResult.error) throw queryFailure("Não foi possível carregar os times", squadsResult.error.code);
    if (matchResult.error) throw queryFailure("Não foi possível carregar as partidas", matchResult.error.code);
    if (contributionsResult.error) throw queryFailure("Não foi possível carregar as contribuições", contributionsResult.error.code);

    const players: Player[] = ((playerRows ?? []) as PlayerRow[]).map((row) => ({
      id: row.id, fullName: row.full_name,
      aliases: [row.nickname, ...(row.player_aliases ?? []).map((alias) => alias.alias)].filter((value): value is string => Boolean(value)),
      role: row.role_preference === "keeper" ? "keeper" : "line",
      membership: row.membership_status ?? "regular",
      publicVisible: row.public_visible,
      publicDisplayName: row.public_display_name ?? undefined,
    }));
    const attendance: Attendance[] = ((attendanceResult.data ?? []) as AttendanceRow[]).map((row) => ({ id: row.id, playerId: row.player_id, arrivalIndex: row.arrival_index, status: row.status, rolePreference: row.role_preference === "keeper" ? "keeper" : "line" }));
    const rules = readRules(session.rules_snapshot ?? {});
    const persistedSquads: Squad[] = ((squadsResult.data ?? []) as SquadRow[]).map((row) => {
      const playerIds = (row.squad_members ?? []).filter((member) => !member.removed_at).toSorted((a, b) => a.assignment_order - b.assignment_order).map((member) => member.player_id);
      return { id: row.id, number: row.squad_number, playerIds, complete: playerIds.length >= rules.squadSize, deficit: Math.max(0, rules.squadSize - playerIds.length) };
    });
    const latestMatch = ((matchResult.data ?? [])[0] ?? null) as MatchRow | null;
    let activeMatch: LiveMatch | undefined;
    if (latestMatch && latestMatch.state !== "completed" && latestMatch.state !== "cancelled") {
      const [assignmentsResult, eventsResult, clockResult] = await Promise.all([
        this.client.from("match_assignments").select("id,player_id,squad_id,field_side,role").eq("match_id", latestMatch.id).neq("status", "cancelled"),
        this.client.from("match_events").select("id,event_type,side,scorer_player_id,assist_player_id,keeper_player_id,goal_kind,penalty_outcome,occurrence_ms,status,label").eq("match_id", latestMatch.id).order("created_at"),
        this.client.rpc("get_match_clock_snapshot", { p_match_id: latestMatch.id }),
      ]);
      if (assignmentsResult.error || eventsResult.error || clockResult.error) throw new Error("Não foi possível carregar a partida ativa.");
      const clock = clockResult.data as { state: LiveMatch["state"]; started_at_server: string | null; elapsed_ms_before_start: number; duration_limit_ms: number; revision: number; server_now: string };
      activeMatch = {
        id: latestMatch.id, ordinal: latestMatch.ordinal, yellowSquadId: latestMatch.yellow_squad_id, redSquadId: latestMatch.red_squad_id,
        state: clock.state, clockPhase: latestMatch.clock_phase, startedAtServer: clock.started_at_server ?? undefined,
        elapsedMsBeforeStart: Number(clock.elapsed_ms_before_start), durationLimitMs: clock.duration_limit_ms,
        regulationDurationMs: latestMatch.regulation_duration_ms, overtimeDurationMs: latestMatch.overtime_duration_ms,
        revision: Number(clock.revision), serverNow: clock.server_now,
        assignments: ((assignmentsResult.data ?? []) as AssignmentRow[]).map((row) => ({ id: row.id, playerId: row.player_id, squadId: row.squad_id ?? undefined, side: row.field_side ?? undefined, role: row.role })),
        events: ((eventsResult.data ?? []) as EventRow[]).map((row) => ({ id: row.id, type: row.event_type, side: row.side ?? undefined, scorerPlayerId: row.scorer_player_id ?? undefined, assistPlayerId: row.assist_player_id ?? undefined, keeperPlayerId: row.keeper_player_id ?? undefined, goalKind: row.goal_kind ?? undefined, penaltyOutcome: row.penalty_outcome ?? undefined, occurrenceMs: Number(row.occurrence_ms), status: row.status, label: row.label ?? undefined })),
      };
    }

    return {
      id: typedRanka.id, orgId: typedRanka.org_id, sessionId: session.id, name: typedRanka.name,
      sessionLabel: new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${session.scheduled_on}T12:00:00Z`)),
      sessionDate: session.scheduled_on,
      sessionState: session.state,
      players, attendance,
      squads: persistedSquads.length ? persistedSquads : groupSquads(attendance, players, { squadSize: rules.squadSize }),
      hasPersistedSquads: persistedSquads.length > 0,
      rules, contributionAmountCents: session.contribution_amount_cents,
      contributions: ((contributionsResult.data ?? []) as ContributionRow[]).map((row) => ({ playerId: row.player_id, amountCents: row.amount_cents, status: row.status })),
      activeMatch, revision: session.revision,
      portal: { slug: typedRanka.slug, visibility: typedRanka.visibility, hasProtectedLink: Boolean(typedRanka.invite_token_hash) },
    };
  }

  async saveAttendance(): Promise<RankaSnapshot> {
    throw new Error("Escritas usam RPC transacional; não há gravação direta de presença.");
  }

  async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const { data, error } = await this.client.rpc("get_session_summary", { p_session_id: sessionId });
    if (error) throw new Error("Não foi possível carregar o resumo do ranka.");
    const parsed = sessionSummarySchema.parse(data);
    return { matches: parsed.matches, topTeam: parsed.topTeam ?? undefined, bottomTeam: parsed.bottomTeam ?? undefined, topScorer: parsed.topScorer ?? undefined, topAssist: parsed.topAssist ?? undefined, bestKeeper: parsed.bestKeeper ?? undefined, worstKeeper: parsed.worstKeeper ?? undefined };
  }
}
