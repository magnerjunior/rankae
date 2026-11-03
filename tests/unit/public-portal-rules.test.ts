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

  it("builds a manual live result without private fields", () => {
    const text = buildShareSummary({
      ...base,
      liveMatch: {
        ordinal: 2,
        state: "live",
        clockPhase: "regulation",
        elapsedMsBeforeStart: 0,
        durationLimitMs: 600_000,
        yellow: { number: 1, score: 2, players: ["Nando"] },
        red: { number: 2, score: 1, players: ["Beto"] },
        ballBoys: [],
        keepers: {},
      },
    });
    expect(text).toContain("Amarelo T1 2 x 1 Vermelho T2");
    expect(text).toContain("Próximos: T3");
    expect(text).not.toContain("contribui");
  });
});

