import type {
  Attendance,
  ContributionRecord,
  MatchClockSnapshot,
  MatchEvent,
  OfficialSuggestion,
  Player,
  RotationResult,
  ScoreProjection,
  Squad,
  TieAction,
  TiePolicy,
} from "./types";

export function normalizePlayerSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findPlayerMatches(players: Player[], query: string): Player[] {
  const normalized = normalizePlayerSearch(query);
  if (!normalized) return [];
  return players.filter((player) =>
    [player.fullName, ...player.aliases].some((value) => normalizePlayerSearch(value).includes(normalized)),
  );
}

export function findPotentialDuplicates(players: Player[], fullName: string, aliases: string[] = []): Player[] {
  const candidates = new Set([fullName, ...aliases].map(normalizePlayerSearch).filter(Boolean));
  return players.filter((player) =>
    [player.fullName, ...player.aliases].some((value) => candidates.has(normalizePlayerSearch(value))),
  );
}

export function orderEligibleAttendance(attendance: Attendance[]): Attendance[] {
  return attendance
    .filter((entry) => entry.status === "present")
    .toSorted((a, b) => a.arrivalIndex - b.arrivalIndex || a.id.localeCompare(b.id));
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

interface GroupSquadsOptions {
  squadSize?: number;
  method?: "sequential" | "shuffle_blocks";
  seed?: number;
}

export function groupSquads(
  attendance: Attendance[],
  players: Player[],
  options: GroupSquadsOptions = {},
): Squad[] {
  const squadSize = options.squadSize ?? 6;
  if (!Number.isInteger(squadSize) || squadSize < 1) {
    throw new Error("O tamanho do time deve ser um inteiro positivo.");
  }

  const playerById = new Map(players.map((player) => [player.id, player]));
  const orderedIds = orderEligibleAttendance(attendance)
    .map((entry) => entry.playerId)
    .filter((playerId) => playerById.get(playerId)?.role === "line");

  const blockSize = squadSize * 2;
  const selected = options.method === "shuffle_blocks"
    ? [
        ...seededShuffle(orderedIds.slice(0, blockSize), options.seed ?? 1),
        ...orderedIds.slice(blockSize),
      ]
    : orderedIds;

  const squads: Squad[] = [];
  for (let index = 0; index < selected.length; index += squadSize) {
    const playerIds = selected.slice(index, index + squadSize);
    const number = squads.length + 1;
    squads.push({
      id: `squad-${number}`,
      number,
      playerIds,
      complete: playerIds.length === squadSize,
      deficit: squadSize - playerIds.length,
    });
  }
  return squads;
}

export function suggestOfficials(
  presentKeeperIds: string[],
  waitingLinePlayerIds: string[],
): OfficialSuggestion {
  const [firstKeeper, secondKeeper, ...waitingKeeperIds] = presentKeeperIds;
  const borrowedKeeperIds: string[] = [];
  const warnings: string[] = [];
  let yellowKeeperId = firstKeeper;
  let redKeeperId = secondKeeper;

  if (!firstKeeper) {
    yellowKeeperId = waitingLinePlayerIds[0];
    redKeeperId = waitingLinePlayerIds[1];
    borrowedKeeperIds.push(...waitingLinePlayerIds.slice(0, 2));
    if (borrowedKeeperIds.length < 2) warnings.push("Faltam opções para completar os dois goleiros.");
  } else if (!secondKeeper) {
    redKeeperId = waitingLinePlayerIds[0];
    if (redKeeperId) borrowedKeeperIds.push(redKeeperId);
    else warnings.push("O lado vermelho ainda precisa de um goleiro.");
  }

  const used = new Set([yellowKeeperId, redKeeperId].filter(Boolean));
  const ballBoyIds = waitingLinePlayerIds.filter((id) => !used.has(id)).slice(0, 2);
  if (ballBoyIds.length < 2) warnings.push("Há menos de dois gandulas disponíveis para sugestão.");

  return {
    yellowKeeperId,
    redKeeperId,
    borrowedKeeperIds,
    ballBoyIds,
    waitingKeeperIds,
    warnings,
  };
}

export function assignKeepersToSquads(
  keeperIds: string[],
  squadIds: string[],
): Record<string, string> {
  return Object.fromEntries(squadIds.slice(0, keeperIds.length).map((squadId, index) => [squadId, keeperIds[index]]));
}

export function rotateKeeperOnLoss(input: {
  yellowKeeperId: string;
  redKeeperId: string;
  waitingKeeperIds: string[];
  losingSide: "yellow" | "red";
}): { yellowKeeperId: string; redKeeperId: string; waitingKeeperIds: string[] } {
  const incoming = input.waitingKeeperIds[0];
  if (!incoming) {
    return {
      yellowKeeperId: input.yellowKeeperId,
      redKeeperId: input.redKeeperId,
      waitingKeeperIds: [],
    };
  }
  const outgoing = input.losingSide === "yellow" ? input.yellowKeeperId : input.redKeeperId;
  return {
    yellowKeeperId: input.losingSide === "yellow" ? incoming : input.yellowKeeperId,
    redKeeperId: input.losingSide === "red" ? incoming : input.redKeeperId,
    waitingKeeperIds: [...input.waitingKeeperIds.slice(1), outgoing],
  };
}

export function evaluateTiePolicy(
  policy: TiePolicy,
  fullWaitingSquads: number,
  phase: "regulation" | "overtime",
): TieAction {
  const configured = phase === "regulation" ? policy.onFirstTie : policy.afterOvertime;
  if (configured === "overtime") return { type: "overtime", minutes: policy.overtimeMinutes };
  if (configured === "both_out" && fullWaitingSquads < policy.ifWaitingFullSquadsAtLeast) {
    return {
      type: policy.whenWaitingBelowThreshold,
      reason: "A espera não tem times completos suficientes para retirar os dois lados.",
    };
  }
  if (configured === "both_out") return { type: "both_out" };
  return { type: configured, reason: `Política aplicada após ${phase === "regulation" ? "tempo normal" : "prorrogação"}.` };
}

interface RotateSquadsInput {
  yellowSquadId: string;
  redSquadId: string;
  waitingSquadIds: string[];
  result: "yellow_win" | "red_win" | "both_out";
  requeuedSquadIds?: string[];
}

export function rotateSquads(input: RotateSquadsInput): RotationResult {
  const waiting = [...input.waitingSquadIds];
  const warnings: string[] = [];
  let yellowSquadId: string | undefined = input.yellowSquadId;
  let redSquadId: string | undefined = input.redSquadId;

  if (input.result === "yellow_win") redSquadId = waiting.shift();
  if (input.result === "red_win") yellowSquadId = waiting.shift();
  if (input.result === "both_out") {
    yellowSquadId = waiting.shift();
    redSquadId = waiting.shift();
  }

  waiting.push(...(input.requeuedSquadIds ?? []));
  if (!yellowSquadId || !redSquadId) warnings.push("Não há times completos suficientes; revisão manual necessária.");
  return { yellowSquadId, redSquadId, waitingSquadIds: waiting, warnings };
}

export function findReplacement(
  attendance: Attendance[],
  excludedPlayerIds: string[],
): string | undefined {
  const excluded = new Set(excludedPlayerIds);
  return orderEligibleAttendance(attendance).find((entry) => !excluded.has(entry.playerId))?.playerId;
}

export function computeClockElapsed(snapshot: MatchClockSnapshot, nowIso: string): number {
  const running = snapshot.state === "live" || snapshot.state === "overtime_live";
  if (!running || !snapshot.startedAtServer) return Math.max(0, snapshot.elapsedMsBeforeStart);
  const startedAt = Date.parse(snapshot.startedAtServer);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) throw new Error("Snapshot de relógio inválido.");
  return Math.max(0, snapshot.elapsedMsBeforeStart + now - startedAt);
}

export function projectScore(events: MatchEvent[]): ScoreProjection {
  return events.reduce<ScoreProjection>((score, event) => {
    if (event.status !== "active") return score;
    if (event.type === "goal" && event.side) score[event.side] += 1;
    if (event.type === "penalty_attempt") {
      if (event.penaltyOutcome === "converted") {
        score.convertedPenalties += 1;
        if (event.side) score[event.side] += 1;
      }
      if (event.penaltyOutcome === "missed") score.missedPenalties += 1;
      if (event.penaltyOutcome === "saved") {
        score.savedPenalties += 1;
        score.missedPenalties += 1;
      }
    }
    return score;
  }, { yellow: 0, red: 0, convertedPenalties: 0, missedPenalties: 0, savedPenalties: 0 });
}

export function validateOfficialAssignments(input: {
  yellowKeeperId?: string;
  redKeeperId?: string;
  ballBoyIds: string[];
}): string[] {
  const assignments = [input.yellowKeeperId, input.redKeeperId, ...input.ballBoyIds].filter(
    (value): value is string => Boolean(value),
  );
  return assignments.length === new Set(assignments).size
    ? []
    : ["Um participante não pode ocupar duas funções simultaneamente."];
}

export function summarizeContributions(records: ContributionRecord[]) {
  return records.reduce(
    (summary, record) => {
      summary[record.status] += 1;
      summary.expectedCents += record.status === "waived" ? 0 : record.amountCents;
      summary.receivedCents += record.status === "paid" ? record.amountCents : 0;
      return summary;
    },
    { paid: 0, pending: 0, waived: 0, expectedCents: 0, receivedCents: 0 },
  );
}

export function canAcceptArrival(currentCount: number, limit: number): boolean {
  return Number.isInteger(currentCount) && Number.isInteger(limit) && currentCount >= 0 && limit >= 0 && currentCount < limit;
}

export function calculateContributionShare(input: {
  mode: "fixed" | "divide_total";
  fixedCents: number;
  totalCents: number;
  presentCount: number;
}): number {
  if (input.mode === "fixed") return Math.max(0, Math.round(input.fixedCents));
  if (input.presentCount <= 0) return 0;
  return Math.max(0, Math.round(input.totalCents / input.presentCount));
}

export function swapPlayersBetweenSquads(
  squads: Squad[],
  first: { squadId: string; playerId: string },
  second: { squadId: string; playerId: string },
): Squad[] {
  if (first.squadId === second.squadId) return squads;
  const firstSquad = squads.find((squad) => squad.id === first.squadId);
  const secondSquad = squads.find((squad) => squad.id === second.squadId);
  if (!firstSquad?.playerIds.includes(first.playerId) || !secondSquad?.playerIds.includes(second.playerId)) {
    throw new Error("Jogador não pertence ao time informado.");
  }
  return squads.map((squad) => {
    if (squad.id === first.squadId) {
      return { ...squad, playerIds: squad.playerIds.map((id) => id === first.playerId ? second.playerId : id) };
    }
    if (squad.id === second.squadId) {
      return { ...squad, playerIds: squad.playerIds.map((id) => id === second.playerId ? first.playerId : id) };
    }
    return squad;
  });
}
