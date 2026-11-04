import { describe, expect, it } from "vitest";
import { absenceDetails, type PlayerActivity } from "./player-activity";

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
