import { describe, expect, it } from "vitest";
import { nextRankaDate, scheduleSchema } from "@/domain/ranka/schedule";

describe("ranka schedule", () => {
  it("keeps a one-off date and ignores it once it passes", () => {
    const schedule = { mode: "date", date: "2026-11-20" } as const;
    expect(nextRankaDate(schedule, "2026-11-20")).toBe("2026-11-20");
    expect(nextRankaDate(schedule, "2026-11-21")).toBeUndefined();
  });

  it("finds the next selected weekday and wraps into the next week", () => {
    const schedule = { mode: "weekly", weekdays: [1, 5] } as const;
    expect(nextRankaDate({ ...schedule, weekdays: [...schedule.weekdays] }, "2026-11-21")).toBe("2026-11-23");
  });

  it("alternates days using Monday-based weeks across months", () => {
    const schedule = { mode: "alternating", date: "2026-11-23", alternateDay: 2 } as const;
    expect(nextRankaDate(schedule, "2026-11-20")).toBe("2026-11-23");
    expect(nextRankaDate(schedule, "2026-11-24")).toBe("2026-12-01");
    expect(nextRankaDate(schedule, "2026-12-02")).toBe("2026-12-07");
    expect(scheduleSchema.safeParse({ mode: "weekly", weekdays: [] }).success).toBe(false);
  });
});
