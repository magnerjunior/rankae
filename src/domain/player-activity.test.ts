import { describe, expect, it } from "vitest";
import { absenceDetails, selectPlayerActivityRows, type PlayerActivity } from "./player-activity";

const player: PlayerActivity = { player_id: "p", last_seen_on: "2026-10-27", absence_since_on: "2026-10-27", missed_sessions: 0, unpaid_sessions: 0, unpaid_cents: 0, alert_months: 6 };

describe("ausência do jogador", () => {
  it("fica em dia enquanto nenhum encontro terminou sem sua presença", () => {
    expect(absenceDetails(player, "2026-11-04").short).toBe("Em dia");
  });

  it("conta encontros perdidos e semanas desde a última presença", () => {
    expect(absenceDetails({ ...player, missed_sessions: 1 }, "2026-11-04")).toMatchObject({ short: "Há 1 semana", alert: false });
  });

  it("acende o alerta após seis meses corridos", () => {
    expect(absenceDetails({ ...player, absence_since_on: "2026-05-04", missed_sessions: 5 }, "2026-11-04")).toMatchObject({ short: "Há 6 meses", alert: true });
  });
});

describe("lista de jogadores", () => {
  const rows = [
    { player: { fullName: "Ana" }, activity: { ...player, player_id: "a", absence_since_on: "2026-10-01", missed_sessions: 2, unpaid_sessions: 0 } },
    { player: { fullName: "Bia" }, activity: { ...player, player_id: "b", absence_since_on: "2026-11-01", missed_sessions: 1, unpaid_sessions: 2 } },
    { player: { fullName: "Caio" }, activity: { ...player, player_id: "c", absence_since_on: "2026-11-04", missed_sessions: 0, unpaid_sessions: 0 } },
  ];

  it("filtra pendências e quem perdeu encontros", () => {
    expect(selectPlayerActivityRows(rows, "debt", "longest", "2026-11-04").map((row) => row.player.fullName)).toEqual(["Bia"]);
    expect(selectPlayerActivityRows(rows, "absent", "longest", "2026-11-04").map((row) => row.player.fullName)).toEqual(["Ana", "Bia"]);
  });

  it("ordena por ausência mais longa ou mais curta", () => {
    expect(selectPlayerActivityRows(rows, "all", "longest", "2026-11-04").map((row) => row.player.fullName)).toEqual(["Ana", "Bia", "Caio"]);
    expect(selectPlayerActivityRows(rows, "all", "shortest", "2026-11-04").map((row) => row.player.fullName)).toEqual(["Caio", "Bia", "Ana"]);
  });
});
