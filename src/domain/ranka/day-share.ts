import { historyScore, summarizeTeamHistory, type HistoryAssignment, type HistoryEvent, type HistoryGame } from "./team-history";

export type DayShareData = {
  games: (HistoryGame & { ordinal: number })[];
  assignments: HistoryAssignment[];
  events: (HistoryEvent & { scorer_player_id: string | null })[];
  squads: { id: string; squad_number: number }[];
  official: ReadonlyMap<string, string>;
  names: ReadonlyMap<string, string>;
};

const list = new Intl.ListFormat("pt-BR");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });
const clean = (text: string) => text.replace(/[*\r\n]/g, " ").replace(/\s+/g, " ").trim();
const quantity = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

type TeamRank = ReturnType<typeof summarizeTeamHistory>[number];
function teamName(team: TeamRank) {
  return [...team.numbers].sort((a, b) => a - b).map((number) => `Time ${number}`).join(" / ") || "Time sem número";
}

function leaders<T>(items: T[], count: (item: T) => number) {
  const max = items.reduce((best, item) => Math.max(best, count(item)), 0);
  return { max, items: max ? items.filter((item) => count(item) === max) : [] };
}

export function formatDayShare({ name, date, publicUrl, data }: { name: string; date: string; publicUrl?: string; data: DayShareData }) {
  const games = data.games.filter((game) => game.state === "completed").sort((a, b) => a.ordinal - b.ordinal);
  const gameIds = new Set(games.map((game) => game.id));
  const events = data.events.filter((event) => gameIds.has(event.match_id) && event.status === "active");
  const teams = summarizeTeamHistory(games, data.squads, data.assignments, events, data.official);
  const wins = leaders(teams, (team) => team.wins);
  const losses = leaders(teams, (team) => team.losses);
  const squadNumbers = new Map(data.squads.map((squad) => [squad.id, squad.squad_number]));
  const nameOf = (id: string) => clean(data.names.get(id) ?? "");
  const roster = (team: TeamRank) => [...team.players].map(nameOf).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const labelTeams = (items: TeamRank[]) => items.length > 1 && items.every((team) => team.numbers.size === 1)
    ? `Times ${list.format(items.flatMap((team) => [...team.numbers]).sort((a, b) => a - b).map(String))}`
    : list.format(items.map(teamName));
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  for (const event of events) {
    if (event.event_type !== "goal") continue;
    if (event.scorer_player_id && event.goal_kind !== "own_goal") {
      goals.set(event.scorer_player_id, (goals.get(event.scorer_player_id) ?? 0) + 1);
    }
    if (event.assist_player_id) assists.set(event.assist_player_id, (assists.get(event.assist_player_id) ?? 0) + 1);
  }
  const highlight = (counts: Map<string, number>, singular: string, plural: string, empty: string) => {
    const { max, items } = leaders([...counts], ([, count]) => count);
    const names = items.map(([id]) => nameOf(id)).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return names.length ? `*${list.format(names)} — ${quantity(max, singular, plural)}${names.length > 1 ? " cada" : ""}*` : empty;
  };
  const teamSection = (title: string, team: TeamRank, total: string) => {
    const players = roster(team);
    return [title, `*${teamName(team)} — ${total}*`, ...(players.length ? [`👥 Jogadores: ${players.join(", ")}`] : [])].join("\n");
  };
  const resultEvents = new Map<string, HistoryEvent[]>();
  for (const event of events) {
    const grouped = resultEvents.get(event.match_id);
    if (grouped) grouped.push(event);
    else resultEvents.set(event.match_id, [event]);
  }
  const squadName = (id: string) => squadNumbers.has(id) ? `Time ${squadNumbers.get(id)}` : "Time sem número";
  const results = games.map((game) => {
    const score = historyScore(resultEvents.get(game.id) ?? []);
    return `🏟️ Jogo ${game.ordinal}: ${squadName(game.yellow_squad_id)}  ${score.yellow} × ${score.red}  ${squadName(game.red_squad_id)}`;
  });
  const formattedDate = dateFormatter.format(new Date(`${date}T12:00:00Z`));
  const winText = quantity(wins.max, "vitória", "vitórias");
  const lossText = quantity(losses.max, "derrota", "derrotas");
  return [
    `⚽ *${clean(name).toLocaleUpperCase("pt-BR")} | RESUMO DO DIA*\n📅 ${formattedDate.charAt(0).toLocaleUpperCase("pt-BR") + formattedDate.slice(1)}`,
    "🏁 *FIM DE JOGO!*\nA resenha terminou e as estatísticas do dia já estão disponíveis!",
    [
      "📊 *RESUMO DO DIA*",
      `🎮 Partidas disputadas: ${games.length}`,
      wins.items.length ? `🏆 ${wins.items.length > 1 ? "Times com mais vitórias" : "Time com mais vitórias"}: *${labelTeams(wins.items)} (${winText}${wins.items.length > 1 ? " cada" : ""})*` : "🏆 Nenhuma vitória registrada.",
      losses.items.length ? `📉 ${losses.items.length > 1 ? "Times com mais derrotas" : "Time com mais derrotas"}: *${labelTeams(losses.items)} (${lossText}${losses.items.length > 1 ? " cada" : ""})*` : "📉 Nenhuma derrota registrada.",
    ].join("\n"),
    ...(wins.items.length === 1 ? [teamSection("🏆 *TIME CAMPEÃO DO DIA*", wins.items[0], winText)] : []),
    ...(losses.items.length === 1 ? [teamSection("📉 *TIME COM MAIS DERROTAS*", losses.items[0], lossText)] : []),
    [
      "🔥 *DESTAQUES INDIVIDUAIS*",
      `⚽ Artilheiro: ${highlight(goals, "gol", "gols", "Sem gols com autoria registrada.")}`,
      `👟 Rei das assistências: ${highlight(assists, "assistência", "assistências", "Sem assistências registradas.")}`,
    ].join("\n"),
    ["📋 *RESULTADOS DAS PARTIDAS*", ...(results.length ? results : ["Nenhuma partida disputada."])].join("\n"),
    ...(publicUrl ? ["📈 *QUER VER TODAS AS ESTATÍSTICAS?*\nConfira o desempenho dos jogadores, ranking de gols, assistências, vitórias e muito mais!", `🔗 ${publicUrl}`] : []),
  ].join("\n\n");
}
