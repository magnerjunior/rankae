import { describe, expect, it } from "vitest";
import { preferredTieMethod } from "@/domain/ranka/tie-preference";

describe("desempate depois da prorrogação", () => {
  it("sugere saída dupla quando a regra está ativa e há dois times completos esperando", () => {
    expect(preferredTieMethod(2, true, "manual")).toBe("both_out");
  });

  it("usa a preferência de desempate quando a fila é insuficiente ou a regra está desativada", () => {
    expect(preferredTieMethod(1, true, "manual")).toBe("manual");
    expect(preferredTieMethod(0, true, "odd_even")).toBe("odd_even");
    expect(preferredTieMethod(2, false, "penalties")).toBe("penalties");
  });
});
