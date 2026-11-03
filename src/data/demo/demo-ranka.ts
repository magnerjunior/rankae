import { groupSquads } from "@/domain/ranka/rules";
import type { Attendance, Player } from "@/domain/ranka/types";
import type { RankaRepository, RankaSnapshot } from "@/data/ports/ranka-repository";

const names = [
  ["Rafael Almeida", "Rafa"], ["Bruno Costa", "Bruninho"], ["Caio Mendes", "Caião"],
  ["Diego Santos", "Didi"], ["Eduardo Lima", "Dudu"], ["Felipe Rocha", "Fê"],
  ["Gabriel Nunes", "Biel"], ["Henrique Alves", "Kiko"], ["Igor Martins", "Igão"],
  ["João Vitor", "JV"], ["Kauã Pereira", "KP"], ["Lucas Freitas", "Luquinha"],
  ["Matheus Ribeiro", "Math"], ["Nicolas Souza", "Nick"], ["Otávio Barros", "Tavinho"],
  ["Paulo Henrique", "PH"], ["Renan Oliveira", "Rê"], ["Samuel Teixeira", "Samuca"],
  ["Thiago Gomes", "TG"], ["Vinícius Lopes", "Vini"], ["Wesley Cardoso", "Wes"],
  ["Yuri Fernandes", "Yuri"], ["André Batista", "Dedé"], ["Leandro Pires", "Léo"],
  ["Marcelo Duarte", "Celo"],
] as const;

export const demoPlayers: Player[] = [
  ...names.map(([fullName, alias], index) => ({ id: `p${index + 1}`, fullName, aliases: [alias], role: "line" as const })),
  { id: "g1", fullName: "Carlos Eduardo", aliases: ["Cadu"], role: "keeper" },
  { id: "g2", fullName: "Murilo Azevedo", aliases: ["Muri"], role: "keeper" },
  { id: "g3", fullName: "Pedro Magalhães", aliases: ["Pedrão"], role: "keeper" },
];

export const demoAttendance: Attendance[] = demoPlayers.slice(0, 27).map((player, index) => ({
  id: `attendance-${index + 1}`,
  playerId: player.id,
  arrivalIndex: index + 1,
  status: index === 24 ? "temporarily_out" : "present",
}));

export const demoSnapshot: RankaSnapshot = {
  id: "demo",
  name: "Ranka do Parque",
  sessionLabel: "Sessão demonstrativa · 19h",
  sessionDate: "2026-11-03",
  sessionState: "running",
  players: demoPlayers,
  attendance: demoAttendance,
  squads: groupSquads(demoAttendance, demoPlayers),
  hasPersistedSquads: false,
  rules: { squadSize: 6, maxLinePlayers: 24, maxKeepers: 3, regulationDurationMs: 420_000, overtimeDurationMs: 180_000, targetGoals: 0, targetGoalDifference: 0, tiePolicy: "overtime", contributionMode: "fixed", totalCostCents: 0 },
  contributionAmountCents: 500,
  contributions: [],
  revision: 1,
};

/** Adaptador local e não persistente. É substituído por infraestrutura real na Fase 1.5. */
export class DemoRankaRepository implements RankaRepository {
  async getSnapshot(): Promise<RankaSnapshot> {
    return structuredClone(demoSnapshot);
  }

  async saveAttendance(input: Parameters<RankaRepository["saveAttendance"]>[0]): Promise<RankaSnapshot> {
    return { ...structuredClone(demoSnapshot), attendance: input.attendance, revision: input.expectedRevision + 1 };
  }
}
