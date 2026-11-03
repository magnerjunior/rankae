export interface MetricWindow {
  samples: number;
  p95Ms: number;
  errorRate: number;
}

export type OperationalAlert =
  | { kind: "error_rate"; severity: "critical"; reason: "5xx_above_one_percent" }
  | { kind: "latency"; severity: "warning" | "critical"; reason: "p95_two_windows" };

export function evaluateRouteHealth(current: MetricWindow, previous: MetricWindow): OperationalAlert[] {
  if (current.samples < 50) return [];
  const alerts: OperationalAlert[] = [];
  if (current.errorRate > 0.01) alerts.push({ kind: "error_rate", severity: "critical", reason: "5xx_above_one_percent" });
  if (previous.samples >= 50 && current.p95Ms > 1000 && previous.p95Ms > 1000) {
    alerts.push({ kind: "latency", severity: current.p95Ms > 2000 ? "critical" : "warning", reason: "p95_two_windows" });
  }
  return alerts;
}

export function mayPublishLegalDocument(input: { reviewedAt?: string; reviewedBy?: string; effectiveAt?: string }) {
  return Boolean(input.reviewedAt && input.reviewedBy && input.effectiveAt);
}
