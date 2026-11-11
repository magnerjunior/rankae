import { describe, expect, it } from "vitest";
import { isRevisionConflict } from "@/lib/database-errors";

describe("revision conflict rollout", () => {
  it.each(["PT409", "40001"])("recognizes %s as a conflict", (code) => {
    expect(isRevisionConflict(code)).toBe(true);
  });
  it.each([undefined, "42501", "23505", "55000", "P0001"])("does not retry unrelated error %s", (code) => {
    expect(isRevisionConflict(code)).toBe(false);
  });
});
