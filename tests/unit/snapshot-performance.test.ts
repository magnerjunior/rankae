import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RankaNotFoundError, SupabaseRankaRepository } from "@/data/supabase/supabase-ranka-repository";

// Controlled network waves: no production data or wall-clock timing assertions.
function database(rankaExists = true) {
  const started: string[] = [];
  const pending = new Map<string, (value: unknown) => void>();
  const client = { from(table: string) {
    const result = new Promise((resolve) => pending.set(table, resolve));
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "order", "limit", "maybeSingle"]) query[method] = () => query;
    query.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
      started.push(table);
      return result.then(resolve, reject);
    };
    return query;
  } } as unknown as SupabaseClient;
  return { started, repository: new SupabaseRankaRepository(client), finish(table: string) {
    const rows: Record<string, unknown> = {
      rankas: rankaExists ? { id: "ranka", org_id: "org", name: "Demo de teste", slug: "teste", visibility: "private_off" } : null,
      sessions: [{ id: "session", scheduled_on: "2026-11-10", state: "open", revision: 1, rules_snapshot: {}, contribution_amount_cents: 0 }],
    };
    pending.get(table)!({ data: rows[table] ?? (table === "rankas" ? null : []), error: null });
  } };
}

describe("snapshot network dependencies", () => {
  it("loads ranka/session together, then players and session details together", async () => {
    const db = database();
    const result = db.repository.getSnapshot("ranka");
    await Promise.resolve();
    expect(db.started).toEqual(["rankas", "sessions"]);
    db.finish("rankas");
    db.finish("sessions");
    await new Promise((resolve) => setImmediate(resolve));
    expect(db.started.slice(2)).toEqual(["attendance", "squads", "matches", "contribution_records", "players"]);
    for (const table of db.started.slice(2)) db.finish(table);
    expect((await result).id).toBe("ranka");
  });

  it("does not load organization details when the ranka is inaccessible", async () => {
    const db = database(false);
    const result = db.repository.getSnapshot("ranka");
    const assertion = expect(result).rejects.toBeInstanceOf(RankaNotFoundError);
    db.finish("rankas");
    db.finish("sessions");
    await assertion;
    expect(db.started).toEqual(["rankas", "sessions"]);
  });
});
