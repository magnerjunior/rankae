import { expect, it } from "vitest";
import { formatDayShare, type DayShareData } from "@/domain/ranka/day-share";

const game = (ordinal: number, yellow: string, red: string) => ({
  id: String(ordinal), ordinal, yellow_squad_id: yellow, red_squad_id: red, state: "completed",
});

function goal(match_id: string, scorer: string, assist: string, side = "yellow"): DayShareData["events"][number] {
  return {
    match_id, event_type: "goal", status: "active", side, scorer_player_id: scorer,
    assist_player_id: assist, goal_kind: "normal", penalty_outcome: null,
  };
}

const render = (data: Partial<DayShareData>, publicUrl?: string) => formatDayShare({
  name: "Ranka Teste", date: "2026-11-16", publicUrl,
  data: {
    games: [], events: [], official: new Map(), assignments: [],
    squads: [{ id: "a", squad_number: 1 }, { id: "b", squad_number: 2 }, { id: "c", squad_number: 3 }],
    names: new Map([["ana", "Ana"], ["joao", "João"], ["luis", "Luís"], ["bia", "Bia"]]),
    ...data,
  },
});

it("formats the session date and all matches in chronological order, with both unique team rosters", () => {
  const games = Array.from({ length: 15 }, (_, index) => game(index + 1, "a", "b")).reverse();
  const { href } = new URL("https://rankae.vercel.app/r/teste?period=day&date=2026-11-16");
  const message = render({
    games,
    events: games.map(({ id }) => goal(id, "joao", "ana")),
    assignments: [
      { match_id: "1", field_side: "yellow", role: "line", status: "confirmed", player_id: "joao", start_ms: 0 },
      { match_id: "1", field_side: "yellow", role: "line", status: "confirmed", player_id: "ana", start_ms: 0 },
      { match_id: "1", field_side: "red", role: "keeper", status: "confirmed", player_id: "luis", start_ms: 0 },
      { match_id: "2", field_side: "yellow", role: "line", status: "confirmed", player_id: "ana", start_ms: 0 },
    ],
  }, href);

  expect(message).toContain("⚽ *RANKA TESTE | RESUMO DO DIA*\n📅 Segunda-feira, 16 de novembro de 2026");
  expect(message).toContain("*Time 1 — 15 vitórias*\n👥 Jogadores: Ana, João");
  expect(message).toContain("*Time 2 — 15 derrotas*\n👥 Jogadores: Luís");
  expect(message.match(/^🏟️ Jogo \d+:/gm)).toEqual(games.toReversed().map(({ ordinal }) => `🏟️ Jogo ${ordinal}:`));
  expect(message).toContain("🏟️ Jogo 15: Time 1  1 × 0  Time 2");
  expect(message.endsWith(`🔗 ${href}`)).toBe(true);
  expect(new URL(`https://wa.me/?text=${encodeURIComponent(message)}`).searchParams.get("text")).toBe(message);
});

it("lists all tied leaders without appointing a unique champion or repeating rosters", () => {
  const games = [game(1, "a", "b"), game(2, "b", "a")];
  const message = render({ games, events: [goal("1", "ana", "bia"), goal("2", "joao", "luis")] });
  expect(message).toContain("*Times 1 e 2 (1 vitória cada)*");
  expect(message).toContain("*Times 1 e 2 (1 derrota cada)*");
  expect(message).toContain("*Ana e João — 1 gol cada*");
  expect(message).toContain("*Bia e Luís — 1 assistência cada*");
  expect(message).not.toMatch(/TIME CAMPEÃO|👥 Jogadores|🔗/);
});

it("keeps drawn matches and ignores cancelled goals and unfinished matches", () => {
  const message = render({
    games: [game(1, "a", "b"), { ...game(2, "b", "c"), state: "live" }],
    events: [{ ...goal("1", "ana", "bia"), status: "void" }, goal("2", "joao", "luis")],
  });
  expect(message).toContain("Partidas disputadas: 1");
  expect(message).toContain("Nenhuma vitória registrada.");
  expect(message).toContain("Nenhuma derrota registrada.");
  expect(message).toContain("Sem assistências registradas.");
  expect(message).toContain("Sem gols com autoria registrada.");
  expect(message).toContain("Time 1  0 × 0  Time 2");
  expect(message).not.toContain("Jogo 2:");
});
