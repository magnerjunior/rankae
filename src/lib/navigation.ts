export const rankaSections = [
  { key: "inicio", label: "Início", short: "Início" },
  { key: "jogo", label: "Jogo", short: "Jogo" },
  { key: "jogadores", label: "Jogadores", short: "Pessoas" },
  { key: "chegada", label: "Chegada", short: "Chegada" },
  { key: "times", label: "Times", short: "Times" },
  { key: "partida", label: "Partida", short: "Jogo" },
  { key: "contribuicoes", label: "Contribuições", short: "Contrib." },
  { key: "estatisticas", label: "Estatísticas", short: "Stats" },
  { key: "historico", label: "Histórico", short: "Histórico" },
  { key: "configuracoes", label: "Configurações", short: "Config." },
] as const;

export type RankaSection = (typeof rankaSections)[number]["key"];

export function isRankaSection(value: string): value is RankaSection {
  return rankaSections.some((section) => section.key === value);
}
