export const rankaSections = [
  { key: "inicio", label: "Início", short: "Início" },
  { key: "jogadores", label: "Jogadores", short: "Pessoas" },
  { key: "chegada", label: "Chegada", short: "Chegada" },
  { key: "times", label: "Times", short: "Times" },
  { key: "partida", label: "Partida", short: "Jogo" },
  { key: "contribuicoes", label: "Contribuições", short: "Contrib." },
  { key: "estatisticas", label: "Estatísticas", short: "Stats" },
  { key: "configuracoes", label: "Regras", short: "Regras" },
] as const;

export type RankaSection = (typeof rankaSections)[number]["key"];

export function isRankaSection(value: string): value is RankaSection {
  return rankaSections.some((section) => section.key === value);
}
