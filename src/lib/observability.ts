type LogLevel = "info" | "warn" | "error";

interface OperationalLog {
  event: string;
  requestId: string;
  route: string;
  durationMs?: number;
  status?: number;
  detail?: string;
}

export function operationalLog(level: LogLevel, payload: OperationalLog) {
  const safe = { timestamp: new Date().toISOString(), level, ...payload };
  const message = JSON.stringify(safe);
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.info(message);
}
