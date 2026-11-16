import type { FieldSide } from "@/domain/ranka/types";

export type HistoryGame = { id: string; state: string; yellow_squad_id: string; red_squad_id: string };
export type HistoryAssignment = { match_id: string; field_side: string | null; role: string; status: string; player_id: string; start_ms: number };
export type HistoryEvent = {
  match_id: string; event_type: string; status: string; side: string | null;
  assist_player_id: string | null; goal_kind: string | null; penalty_outcome: string | null;
  metadata?: { winner_squad_id?: string; method?: string } | null;
};

function scoringEvents(events: HistoryEvent[]) {
  return events.filter((event) => event.status === "active" &&
    (event.event_type === "goal" || (event.event_type === "penalty_attempt" && event.penalty_outcome === "converted")));
}

function countBySide(goals: HistoryEvent[]) {
  return { yellow: goals.filter((event) => event.side === "yellow").length, red: goals.filter((event) => event.side === "red").length };
}

export function historyScore(events: HistoryEvent[]) {
  return countBySide(scoringEvents(events));
}
type TeamHistory = {
  key: string; numbers: Set<number>; sides: Set<FieldSide>; players: Set<string>;
  wins: number; losses: number; draws: number; goals: number; assists: number;
};

function groupMatches<T extends { match_id: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.match_id);
    if (group) group.push(row);
    else groups.set(row.match_id, [row]);
  }
  return groups;
}

export function summarizeTeamHistory(games: HistoryGame[], squads: { id: string; squad_number: number }[], assignments: HistoryAssignment[], events: HistoryEvent[], officialResults: ReadonlyMap<string, string>) {
  const teams = new Map<string, TeamHistory>();
  const formationBySquad = new Map<string, string>();
  const numbers = new Map(squads.map((squad) => [squad.id, squad.squad_number]));
  const byGame = groupMatches(assignments.filter((assignment) => assignment.role !== "ball_boy" && assignment.status !== "cancelled"));
  const scoring = groupMatches(events.filter((event) => event.status === "active"));
  for (const game of games) {
    if (game.state !== "completed") continue;
    const actions = scoring.get(game.id) ?? [];
    const goals = scoringEvents(actions);
    const { yellow: onYellow, red: onRed } = countBySide(goals);
    const tie = actions.findLast((event) => event.event_type === "tie_resolution")?.metadata;
    const official = officialResults.get(game.id);
    const winner = official === "both_out" ? undefined : official ?? (
      onYellow > onRed ? "yellow" : onRed > onYellow ? "red" :
      tie?.winner_squad_id === game.yellow_squad_id ? "yellow" :
      tie?.winner_squad_id === game.red_squad_id ? "red" : undefined
    );
    for (const side of ["yellow", "red"] as const) {
      const squadId = side === "yellow" ? game.yellow_squad_id : game.red_squad_id;
      const lineup = (byGame.get(game.id) ?? []).filter((assignment) => assignment.field_side === side);
      const starters = [...new Set(lineup.filter((assignment) => assignment.role === "line" && assignment.start_ms === 0).map((assignment) => assignment.player_id))].sort();
      const key = formationBySquad.get(squadId) ?? (starters.length ? starters.join(",") : squadId);
      formationBySquad.set(squadId, key);
      const team = teams.get(key) ?? { key, numbers: new Set(), players: new Set(), sides: new Set(), wins: 0, losses: 0, draws: 0, goals: 0, assists: 0 };
      const number = numbers.get(squadId);
      if (number !== undefined) team.numbers.add(number);
      team.sides.add(side);
      for (const player of lineup) team.players.add(player.player_id);
      team.wins += Number(winner === side);
      team.losses += Number(Boolean(winner) && winner !== side);
      team.draws += Number(!winner);
      team.goals += side === "yellow" ? onYellow : onRed;
      team.assists += goals.filter((event) => event.side === side && event.event_type === "goal" && event.assist_player_id && event.goal_kind !== "own_goal").length;
      teams.set(key, team);
    }
  }
  return [...teams.values()].sort((a, b) => b.wins - a.wins || b.goals - a.goals || a.losses - b.losses);
}
