export type PlayerActivity = {
  player_id: string;
  last_seen_on: string | null;
  absence_since_on: string;
  missed_sessions: number;
  unpaid_sessions: number;
  unpaid_cents: number;
  alert_months: number;
};

export function absenceDetails(activity: PlayerActivity, today: string) {
  if (activity.missed_sessions === 0) return { short: "Em dia", exact: "Nenhum encontro perdido desde a última presença", alert: false };
  const start = new Date(`${activity.absence_since_on}T12:00:00Z`);
  const end = new Date(`${today}T12:00:00Z`);
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
  let months = Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
  const anniversary = (count: number) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + count, Math.min(start.getUTCDate(), new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + count + 1, 0)).getUTCDate()), 12));
  if (anniversary(months) > end) months -= 1;
  const remainingWeeks = Math.floor(Math.max(0, end.getTime() - anniversary(months).getTime()) / 604_800_000);
  const weeks = Math.max(1, Math.floor(days / 7));
  const short = months >= 1 ? `Há ${months} ${months === 1 ? "mês" : "meses"}` : `Há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  const exact = `${activity.missed_sessions} ${activity.missed_sessions === 1 ? "encontro perdido" : "encontros perdidos"} · ${months} ${months === 1 ? "mês" : "meses"} e ${remainingWeeks} ${remainingWeeks === 1 ? "semana" : "semanas"} sem comparecer`;
  return { short, exact, alert: months >= activity.alert_months };
}
