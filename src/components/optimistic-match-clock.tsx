"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LiveTimer } from "@/components/live-timer";
import type { MatchState } from "@/domain/ranka/types";

type ClockAction = (formData: FormData) => Promise<void>;

interface OptimisticMatchClockProps {
  matchId: string;
  revision: number;
  state: MatchState;
  startedAtServer?: string;
  elapsedMsBeforeStart: number;
  durationLimitMs: number;
  serverNow: string;
  startAction: ClockAction;
  pauseAction: ClockAction;
  resumeAction: ClockAction;
  resetAction: ClockAction;
  finishRegulationAction: ClockAction;
  finishOvertimeAction: ClockAction;
}

function running(state: MatchState) {
  return state === "live" || state === "overtime_live";
}

export function OptimisticMatchClock(props: OptimisticMatchClockProps) {
  const [pending, startTransition] = useTransition();
  const [clock, setClock] = useState({
    state: props.state,
    startedAtServer: props.startedAtServer,
    elapsedMsBeforeStart: props.elapsedMsBeforeStart,
    durationLimitMs: props.durationLimitMs,
    serverNow: props.serverNow,
  });
  const storageKey = useMemo(() => `rankae:clock:${props.matchId}`, [props.matchId]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...clock, revision: props.revision, savedAt: Date.now() }));
  }, [clock, props.revision, storageKey]);

  function elapsedNow() {
    if (!running(clock.state) || !clock.startedAtServer) return clock.elapsedMsBeforeStart;
    const serverOffset = Date.parse(clock.serverNow) - Date.now();
    return clock.elapsedMsBeforeStart + Math.max(0, Date.now() + serverOffset - Date.parse(clock.startedAtServer));
  }

  function run(command: "start" | "pause" | "resume" | "reset" | "finish_regulation" | "finish_overtime", action: ClockAction) {
    const now = new Date().toISOString();
    setClock((current) => {
      if (command === "start") return { ...current, state: "live", startedAtServer: now, serverNow: now };
      if (command === "resume") return { ...current, state: current.state === "overtime_paused" ? "overtime_live" : "live", startedAtServer: now, serverNow: now };
      if (command === "pause") return { ...current, state: current.state === "overtime_live" ? "overtime_paused" : "paused", elapsedMsBeforeStart: elapsedNow(), startedAtServer: undefined, serverNow: now };
      if (command === "reset") return { ...current, state: "ready", elapsedMsBeforeStart: 0, startedAtServer: undefined, serverNow: now };
      if (command === "finish_regulation") return { ...current, state: "regulation_ended", elapsedMsBeforeStart: elapsedNow(), startedAtServer: undefined, serverNow: now };
      return { ...current, state: "tie_break", elapsedMsBeforeStart: elapsedNow(), startedAtServer: undefined, serverNow: now };
    });
    const data = new FormData();
    data.set("idempotencyKey", crypto.randomUUID());
    startTransition(() => void action(data));
  }

  return <>
    <div className="timer-bar"><LiveTimer {...clock} /></div>
    <div className="score-actions optimistic-clock-actions">
      {clock.state === "ready" && <button className="button button-primary" type="button" onClick={() => run("start", props.startAction)}>Iniciar cronômetro</button>}
      {running(clock.state) && <button className="button button-secondary" type="button" onClick={() => run("pause", props.pauseAction)}>Pausar</button>}
      {(clock.state === "paused" || clock.state === "overtime_paused") && <button className="button button-primary" type="button" onClick={() => run("resume", props.resumeAction)}>Retomar</button>}
      {!['completed','cancelled'].includes(clock.state) && <button className="button button-danger" type="button" onClick={() => run("reset", props.resetAction)}>Reiniciar</button>}
      {(clock.state === "live" || clock.state === "paused") && <button className="button button-secondary" type="button" onClick={() => run("finish_regulation", props.finishRegulationAction)}>Encerrar tempo</button>}
      {(clock.state === "overtime_live" || clock.state === "overtime_paused") && <button className="button button-secondary" type="button" onClick={() => run("finish_overtime", props.finishOvertimeAction)}>Encerrar prorrogação</button>}
      <span className={`clock-save-state ${pending ? "syncing" : "saved"}`}>{pending ? "salvando…" : "salvo"}</span>
    </div>
  </>;
}
