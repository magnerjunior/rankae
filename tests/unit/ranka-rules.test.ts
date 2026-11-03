import { describe, expect, it } from "vitest";
import {
  assignKeepersToSquads,
  calculateContributionShare,
  canAcceptArrival,
  computeClockElapsed,
  evaluateTiePolicy,
  findReplacement,
  findPlayerMatches,
  findPotentialDuplicates,
  groupSquads,
  orderEligibleAttendance,
  projectScore,
  rotateSquads,
  rotateKeeperOnLoss,
  summarizeContributions,
  suggestOfficials,
  validateOfficialAssignments,
} from "@/domain/ranka/rules";
import type { Attendance, Player, TiePolicy } from "@/domain/ranka/types";
import { parseArrivalList } from "@/domain/ranka/arrival-import";

const players: Player[] = Array.from({ length: 30 }, (_, index) => ({
  id: `p${index + 1}`,
  fullName: `Jogador ${index + 1}`,
  aliases: [],
  role: "line",
}));
const attendance = (count: number): Attendance[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `a${index + 1}`,
    playerId: `p${index + 1}`,
    arrivalIndex: index + 1,
    status: "present",
  }));

const policy: TiePolicy = {
  overtimeMinutes: 3,
  onFirstTie: "overtime",
  afterOvertime: "both_out",
  ifWaitingFullSquadsAtLeast: 2,
  whenWaitingBelowThreshold: "penalties",
};

describe("motor puro do ranka", () => {
  it("ordena somente presentes por índice e desempata por id", () => {
    const result = orderEligibleAttendance([
      { id: "b", playerId: "p2", arrivalIndex: 1, status: "present" },
      { id: "x", playerId: "p3", arrivalIndex: 0, status: "left" },
      { id: "a", playerId: "p1", arrivalIndex: 1, status: "present" },
    ]);
    expect(result.map((item) => item.playerId)).toEqual(["p1", "p2"]);
  });

  it("forma quatro times completos com 24 jogadores", () => {
    const squads = groupSquads(attendance(24), players);
    expect(squads).toHaveLength(4);
    expect(squads.map((squad) => squad.playerIds)).toEqual([
      ["p1", "p2", "p3", "p4", "p5", "p6"],
      ["p7", "p8", "p9", "p10", "p11", "p12"],
      ["p13", "p14", "p15", "p16", "p17", "p18"],
      ["p19", "p20", "p21", "p22", "p23", "p24"],
    ]);
  });

  it("mantém o 25º jogador em T5 incompleto", () => {
    const squads = groupSquads(attendance(25), players);
    expect(squads[4]).toMatchObject({ number: 5, playerIds: ["p25"], complete: false, deficit: 5 });
  });

  it.each([
    [18, 3, 0],
    [23, 4, 1],
    [30, 5, 0],
  ])("forma a fila de %i jogadores sem fabricar vagas", (count, expectedSquads, lastDeficit) => {
    const squads = groupSquads(attendance(count), players);
    expect(squads).toHaveLength(expectedSquads);
    expect(squads.at(-1)?.deficit).toBe(lastDeficit);
  });

  it("não mistura blocos de prioridade no sorteio", () => {
    const squads = groupSquads(attendance(24), players, { method: "shuffle_blocks", seed: 42 });
    expect(squads.slice(0, 2).flatMap((squad) => squad.playerIds).sort()).toEqual(
      Array.from({ length: 12 }, (_, index) => `p${index + 1}`).sort(),
    );
    expect(squads.slice(2).flatMap((squad) => squad.playerIds).every((id) => Number(id.slice(1)) >= 13)).toBe(true);
  });

  it("exclui goleiros dedicados da formação de linha", () => {
    const withKeeper = [...players, { id: "g1", fullName: "Goleiro", aliases: [], role: "keeper" as const }];
    const present = [...attendance(6), { id: "ag1", playerId: "g1", arrivalIndex: 1, status: "present" as const }];
    expect(groupSquads(present, withKeeper)[0].playerIds).not.toContain("g1");
  });

  it("sugere dois emprestados e depois dois gandulas quando não há goleiro", () => {
    const suggestion = suggestOfficials([], ["p13", "p14", "p15", "p16"]);
    expect(suggestion.borrowedKeeperIds).toEqual(["p13", "p14"]);
    expect(suggestion.ballBoyIds).toEqual(["p15", "p16"]);
  });

  it("sugere um emprestado e dois seguintes quando há um goleiro", () => {
    const suggestion = suggestOfficials(["g1"], ["p13", "p14", "p15"]);
    expect(suggestion.redKeeperId).toBe("p13");
    expect(suggestion.ballBoyIds).toEqual(["p14", "p15"]);
  });

  it("mantém dois goleiros nos lados e usa os primeiros da espera como gandulas", () => {
    const suggestion = suggestOfficials(["g1", "g2"], ["p13", "p14"]);
    expect([suggestion.yellowKeeperId, suggestion.redKeeperId]).toEqual(["g1", "g2"]);
    expect(suggestion.ballBoyIds).toEqual(["p13", "p14"]);
  });

  it("mantém o terceiro goleiro na espera e roda o goleiro do lado perdedor", () => {
    const suggestion = suggestOfficials(["g1", "g2", "g3"], ["p13", "p14"]);
    expect(suggestion.waitingKeeperIds).toEqual(["g3"]);
    expect(rotateKeeperOnLoss({ yellowKeeperId: "g1", redKeeperId: "g2", waitingKeeperIds: ["g3"], losingSide: "yellow" })).toEqual({
      yellowKeeperId: "g3",
      redKeeperId: "g2",
      waitingKeeperIds: ["g1"],
    });
  });

  it("vincula quatro goleiros a quatro squads sem duplicidade", () => {
    expect(assignKeepersToSquads(["g1", "g2", "g3", "g4"], ["squad-1", "squad-2", "squad-3", "squad-4"])).toEqual({
      "squad-1": "g1",
      "squad-2": "g2",
      "squad-3": "g3",
      "squad-4": "g4",
    });
  });

  it("inicia prorrogação conforme política", () => {
    expect(evaluateTiePolicy(policy, 2, "regulation")).toEqual({ type: "overtime", minutes: 3 });
  });

  it("não força saída dupla com espera insuficiente", () => {
    const result = evaluateTiePolicy(policy, 1, "overtime");
    expect(result.type).toBe("penalties");
  });

  it("faz o próximo time herdar a vaga e a cor do perdedor", () => {
    expect(
      rotateSquads({ yellowSquadId: "squad-1", redSquadId: "squad-2", waitingSquadIds: ["squad-3"], result: "red_win" }),
    ).toMatchObject({ yellowSquadId: "squad-3", redSquadId: "squad-2" });
  });

  it("sinaliza revisão quando os dois saem e falta time completo", () => {
    const result = rotateSquads({ yellowSquadId: "squad-1", redSquadId: "squad-2", waitingSquadIds: ["squad-3"], result: "both_out" });
    expect(result.redSquadId).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
  });

  it("sugere o primeiro substituto elegível fora dos escalados", () => {
    expect(findReplacement(attendance(5), ["p1", "p2", "p3"])).toBe("p4");
  });

  it("busca por nome sem acento e por alias sem duplicar perfil", () => {
    const catalog = [{ id: "m1", fullName: "Mágnêr Júnior", aliases: ["Junior", "Magner"], role: "line" as const }];
    expect(findPlayerMatches(catalog, "magner").map((player) => player.id)).toEqual(["m1"]);
    expect(findPlayerMatches(catalog, "junior").map((player) => player.id)).toEqual(["m1"]);
    expect(findPotentialDuplicates(catalog, "Outro", ["Mágnêr"]).map((player) => player.id)).toEqual(["m1"]);
  });

  it("deriva o relógio do horário autoritativo sem depender de ticks persistidos", () => {
    expect(computeClockElapsed({ state: "live", startedAtServer: "2026-11-03T12:00:00.000Z", elapsedMsBeforeStart: 15_000, durationLimitMs: 600_000, asOfServer: "2026-11-03T12:00:00.000Z" }, "2026-11-03T12:00:30.000Z")).toBe(45_000);
    expect(computeClockElapsed({ state: "paused", elapsedMsBeforeStart: 45_000, durationLimitMs: 600_000, asOfServer: "2026-11-03T12:00:30.000Z" }, "2026-11-03T12:03:00.000Z")).toBe(45_000);
  });

  it("projeta placar por eventos ativos e preserva void no histórico", () => {
    const score = projectScore([
      { id: "e1", type: "goal", side: "yellow", goalKind: "normal", occurrenceMs: 1_000, status: "active" },
      { id: "e2", type: "goal", side: "red", goalKind: "own_goal", occurrenceMs: 2_000, status: "void" },
      { id: "e3", type: "penalty_attempt", side: "red", penaltyOutcome: "converted", occurrenceMs: 3_000, status: "active" },
      { id: "e4", type: "penalty_attempt", side: "yellow", penaltyOutcome: "saved", occurrenceMs: 4_000, status: "active" },
    ]);
    expect(score).toEqual({ yellow: 1, red: 1, convertedPenalties: 1, missedPenalties: 1, savedPenalties: 1 });
  });

  it("impede que goleiro e gandula sejam a mesma pessoa", () => {
    expect(validateOfficialAssignments({ yellowKeeperId: "p1", redKeeperId: "p2", ballBoyIds: ["p2"] })).toHaveLength(1);
    expect(validateOfficialAssignments({ yellowKeeperId: "p1", redKeeperId: "p2", ballBoyIds: ["p3", "p4"] })).toEqual([]);
  });

  it("resume contribuições sem reprecificar isentos ou recebidos", () => {
    expect(summarizeContributions([
      { playerId: "p1", amountCents: 500, status: "paid" },
      { playerId: "p2", amountCents: 500, status: "pending" },
      { playerId: "p3", amountCents: 500, status: "waived" },
    ])).toEqual({ paid: 1, pending: 1, waived: 1, expectedCents: 1_000, receivedCents: 500 });
  });

  it("respeita o limite de chegadas por posição", () => {
    expect(canAcceptArrival(23, 24)).toBe(true);
    expect(canAcceptArrival(24, 24)).toBe(false);
    expect(canAcceptArrival(3, 3)).toBe(false);
  });

  it("divide o custo total entre presentes e preserva valor fixo", () => {
    expect(calculateContributionShare({ mode: "fixed", fixedCents: 550, totalCents: 10_000, presentCount: 20 })).toBe(550);
    expect(calculateContributionShare({ mode: "divide_total", fixedCents: 0, totalCents: 10_000, presentCount: 24 })).toBe(417);
    expect(calculateContributionShare({ mode: "divide_total", fixedCents: 0, totalCents: 10_000, presentCount: 0 })).toBe(0);
  });

  it("importa lista numerada e reconhece GK como goleiro", () => {
    const result = parseArrivalList("GK- Fernando\nGK- Ryan\n1- Esdras\n2- Samuel\n3 - José");
    expect(result.entries).toEqual([
      { fullName: "Fernando", role: "keeper" },
      { fullName: "Ryan", role: "keeper" },
      { fullName: "Esdras", role: "line" },
      { fullName: "Samuel", role: "line" },
      { fullName: "José", role: "line" },
    ]);
    expect(result.ignoredLines).toEqual([]);
  });

  it("ignora nomes repetidos em uma importação sem mudar a ordem", () => {
    const result = parseArrivalList("1- Magner\n2- Magner\nPedro\n");
    expect(result.entries.map((entry) => entry.fullName)).toEqual(["Magner", "Pedro"]);
    expect(result.ignoredLines).toEqual([2]);
  });
});
