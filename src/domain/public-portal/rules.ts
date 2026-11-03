import type { PortalPeriod, PublicRankaSnapshot } from "./types";

const periods = new Set<PortalPeriod>(["last", "month", "season", "day"]);

export function parsePortalPeriod(value: string | undefined, specificDate?: string): { period: PortalPeriod; date?: string } {
  const period = periods.has(value as PortalPeriod) ? (value as PortalPeriod) : "last";
  if (period !== "day") return { period };
  if (!specificDate || !/^\d{4}-\d{2}-\d{2}$/.test(specificDate) || Number.isNaN(Date.parse(`${specificDate}T12:00:00Z`))) {
    return { period: "last" };
  }
  return { period, date: specificDate };
}

export function buildShareSummary(snapshot: PublicRankaSnapshot): string {
  const header = `Rankaê · ${snapshot.rankaName}`;
  const latest = snapshot.results[0];
  if (latest) {
    return [header, `Resultado: Amarelo T${latest.yellowSquadNumber} ${latest.yellowScore} x ${latest.redScore} Vermelho T${latest.redSquadNumber}`, snapshot.periodLabel].join("\n");
  }
  return `${header}\nAinda não há partida publicada para este período.`;
}

