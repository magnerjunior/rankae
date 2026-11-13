import { z } from "zod";

const weekday = z.number().int().min(0).max(6);
export const scheduleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("unset") }),
  z.object({ mode: z.literal("date"), date: z.iso.date() }),
  z.object({ mode: z.literal("weekly"), weekdays: z.array(weekday).min(1).max(7) }),
  z.object({ mode: z.literal("alternating"), date: z.iso.date(), alternateDay: weekday }),
]);
export type RankaSchedule = z.infer<typeof scheduleSchema>;
export const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function nextRankaDate(schedule: RankaSchedule, today: string) {
  if (schedule.mode === "unset") return undefined;
  if (schedule.mode === "date") return schedule.date >= today ? schedule.date : undefined;
  const dayMs = 86_400_000;
  const start = Date.parse(today);
  const weekStart = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * dayMs;
  const anchor = schedule.mode === "alternating" ? Date.parse(schedule.date) : start;
  for (let offset = 0; offset < 14; offset++) {
    const time = Math.max(start, anchor) + offset * dayMs;
    const date = new Date(time);
    const day = date.getUTCDay();
    const week = (weekStart(time) - weekStart(anchor)) / (7 * dayMs);
    const scheduled = schedule.mode === "weekly" ? schedule.weekdays.includes(day) : day === (week % 2 === 0 ? new Date(anchor).getUTCDay() : schedule.alternateDay);
    if (scheduled) return date.toISOString().slice(0, 10);
  }
}
