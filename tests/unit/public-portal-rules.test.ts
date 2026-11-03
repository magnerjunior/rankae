import { describe, expect, it } from "vitest";
import { buildShareSummary, parsePortalPeriod } from "@/domain/public-portal/rules";
import type { PublicRankaSnapshot } from "@/domain/public-portal/types";

const base: PublicRankaSnapshot = {
  rankaName: "Ranka do Bairro",
  slug: "ranka-do-bairro",
  nextSquads: [{ number: 3, players: [] }],
  results: [],
  stats: [],
  period: "last",
  periodLabel: "Último ranka",
  snapshotVersion: 4,
  asOfServer: "2026-11-03T12:00:00.000Z",
};

describe("public portal rules", () => {
  it("accepts documented periods and falls back safely", () => {
    expect(parsePortalPeriod("month")).toEqual({ period: "month" });
    expect(parsePortalPeriod("unexpected")).toEqual({ period: "last" });
  });

  it("requires a valid day filter", () => {
    expect(parsePortalPeriod("day", "2026-11-03")).toEqual({ period: "day", date: "2026-11-03" });
    expect(parsePortalPeriod("day", "03/11/2026")).toEqual({ period: "last" });
  });

  it("does not share an in-progress match from the public statistics portal", () => {
    const text = buildShareSummary({
      ...base,
      liveMatch: {
        ordinal: 2,
        state: "live",
        clockPhase: "regulation",
        elapsedMsBeforeStart: 0,
        durationLimitMs: 420_000,
        yellow: { number: 1, score: 2, players: ["Nando"] },
        red: { number: 2, score: 1, players: ["Beto"] },
        ballBoys: [],
        keepers: {},
      },
    });
    expect(text).toContain("Ainda não há partida publicada");
    expect(text).not.toContain("Amarelo T1");
    expect(text).not.toContain("Próximos");
    expect(text).not.toContain("contribui");
  });
});

