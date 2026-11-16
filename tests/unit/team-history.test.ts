import { expect, it } from "vitest";
import { summarizeTeamHistory } from "@/domain/ranka/team-history";

it("combines a requeued team after its number, kit and lineup order change", () => {
  const a = { id: "a", state: "completed", yellow_squad_id: "one", red_squad_id: "two" };
  const b = { id: "b", state: "completed", yellow_squad_id: "three", red_squad_id: "four" };
  const roster = (match_id: string, field_side: string, ids: string[]) => ids.map((player_id) => ({
    match_id, field_side, player_id, role: "line", status: "confirmed", start_ms: 0,
  }));
  const goal = { match_id: "a", status: "active", side: "yellow", event_type: "goal", assist_player_id: "bia", goal_kind: "normal", penalty_outcome: null };
  const teams = summarizeTeamHistory([a, b],
    ["one", "two", "three", "four"].map((id, index) => ({ id, squad_number: index + 1 })),
    [...roster("a", "yellow", ["ana", "bia"]), ...roster("a", "red", ["rui", "ivo"]),
      ...roster("b", "yellow", ["noa", "tia"]), ...roster("b", "red", ["bia", "ana"])],
    [goal], new Map([["b", "red"]]));

  expect(teams).toHaveLength(3);
  expect(teams[0]).toMatchObject({ wins: 2, losses: 0, draws: 0, goals: 1, assists: 1, numbers: new Set([1, 4]) });
});
