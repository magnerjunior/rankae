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
  const match = snapshot.liveMatch;
  if (match) {
    return [
      header,
      `Jogo ${match.ordinal}: Amarelo T${match.yellow.number} ${match.yellow.score} x ${match.red.score} Vermelho T${match.red.number}`,
      snapshot.nextSquads.length ? `Próximos: ${snapshot.nextSquads.map((squad) => `T${squad.number}`).join(" e ")}` : "Sem próximo time confirmado",
      `Atualizado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.asOfServer))}`,
    ].join("\n");
  }
  const latest = snapshot.results[0];
  if (latest) {
    return [header, `Resultado: Amarelo T${latest.yellowSquadNumber} ${latest.yellowScore} x ${latest.redScore} Vermelho T${latest.redSquadNumber}`, snapshot.periodLabel].join("\n");
  }
  return `${header}\nAinda não há partida publicada para este período.`;
}

