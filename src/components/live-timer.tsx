"use client";

import { useEffect, useState } from "react";
import { computeClockElapsed } from "@/domain/ranka/rules";
import type { MatchState } from "@/domain/ranka/types";

function formatDuration(value: number) {
  const totalSeconds = Math.floor(Math.max(0, value) / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function LiveTimer({ state, startedAtServer, elapsedMsBeforeStart, durationLimitMs, serverNow }: { state: MatchState; startedAtServer?: string; elapsedMsBeforeStart: number; durationLimitMs: number; serverNow: string }) {
  const [elapsed, setElapsed] = useState(elapsedMsBeforeStart);
  useEffect(() => {
    const serverOffset = Date.parse(serverNow) - Date.now();
    const update = () => setElapsed(computeClockElapsed({ state, startedAtServer, elapsedMsBeforeStart, durationLimitMs, asOfServer: serverNow }, new Date(Date.now() + serverOffset).toISOString()));
    const initial = setTimeout(update, 0);
    const interval = setInterval(update, 500);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [state, startedAtServer, elapsedMsBeforeStart, durationLimitMs, serverNow]);
  const remaining = durationLimitMs ? Math.max(0, durationLimitMs - elapsed) : elapsed;
  return <div><div className="timer mono" aria-label={`Tempo ${formatDuration(remaining)}`}>{formatDuration(remaining)}</div><small>{state.includes("overtime") ? "PRORROGAÇÃO" : "TEMPO NORMAL"} · {state === "live" || state === "overtime_live" ? "rodando" : "parado"}</small></div>;
}
