import { describe, expect, it } from "vitest";
import { evaluateRouteHealth, mayPublishLegalDocument } from "@/domain/trust/rules";

describe("regras de confiança e observabilidade", () => {
  it("não alerta com volume menor que 50 amostras", () => {
    expect(evaluateRouteHealth({ samples: 49, p95Ms: 5000, errorRate: 0.5 }, { samples: 100, p95Ms: 5000, errorRate: 0 })).toEqual([]);
  });

  it("não alerta latência por uma única janela lenta", () => {
    expect(evaluateRouteHealth({ samples: 50, p95Ms: 1500, errorRate: 0 }, { samples: 50, p95Ms: 900, errorRate: 0 })).toEqual([]);
  });

  it("abre alerta de latência após duas janelas lentas", () => {
    expect(evaluateRouteHealth({ samples: 80, p95Ms: 1500, errorRate: 0 }, { samples: 70, p95Ms: 1300, errorRate: 0 })).toContainEqual({ kind: "latency", severity: "warning", reason: "p95_two_windows" });
  });

  it("eleva latência acima de dois segundos a crítica", () => {
    expect(evaluateRouteHealth({ samples: 80, p95Ms: 2100, errorRate: 0 }, { samples: 70, p95Ms: 1300, errorRate: 0 })).toContainEqual({ kind: "latency", severity: "critical", reason: "p95_two_windows" });
  });

  it("alerta taxa 5xx estritamente acima de um por cento", () => {
    expect(evaluateRouteHealth({ samples: 100, p95Ms: 400, errorRate: 0.02 }, { samples: 100, p95Ms: 400, errorRate: 0 })).toContainEqual({ kind: "error_rate", severity: "critical", reason: "5xx_above_one_percent" });
    expect(evaluateRouteHealth({ samples: 100, p95Ms: 400, errorRate: 0.01 }, { samples: 100, p95Ms: 400, errorRate: 0 })).toEqual([]);
  });

  it("não publica documento sem revisão, revisor e vigência", () => {
    expect(mayPublishLegalDocument({ reviewedAt: "2026-11-03", effectiveAt: "2026-11-04" })).toBe(false);
    expect(mayPublishLegalDocument({ reviewedAt: "2026-11-03", reviewedBy: "user", effectiveAt: "2026-11-04" })).toBe(true);
  });
});
