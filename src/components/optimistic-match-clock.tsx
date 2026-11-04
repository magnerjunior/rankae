"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveTimer } from "@/components/live-timer";
import { computeClockElapsed } from "@/domain/ranka/rules";
import type { MatchState } from "@/domain/ranka/types";
import type { ClockMutationResult } from "@/app/app/rankas/[rankaId]/actions";

type ClockAction = (formData: FormData) => Promise<ClockMutationResult>;
type Command = "start" | "pause" | "resume" | "reset" | "finish_regulation" | "finish_overtime";

interface ClockView {
  state: MatchState;
  startedAtServer?: string;
  elapsedMsBeforeStart: number;
  durationLimitMs: number;
  serverNow: string;
  revision: number;
}

interface OptimisticMatchClockProps extends ClockView {
  matchId: string;
  startAction: ClockAction;
  pauseAction: ClockAction;
  resumeAction: ClockAction;
  resetAction: ClockAction;
  finishRegulationAction: ClockAction;
  finishOvertimeAction: ClockAction;
  adjustAction: ClockAction;
  showOvertimeOption: boolean;
}

function running(state: MatchState) { return state === "live" || state === "overtime_live"; }

function currentElapsed(clock: ClockView) {
  const offset = Date.parse(clock.serverNow) - Date.now();
  return computeClockElapsed({ state: clock.state, startedAtServer: clock.startedAtServer, elapsedMsBeforeStart: clock.elapsedMsBeforeStart, durationLimitMs: clock.durationLimitMs, asOfServer: clock.serverNow }, new Date(Date.now() + offset).toISOString());
}

function optimisticTransition(clock: ClockView, command: Command): ClockView {
  const now = new Date().toISOString();
  const elapsed = currentElapsed(clock);
  if (command === "start") return { ...clock, state: "live", startedAtServer: now, serverNow: now };
  if (command === "resume") return { ...clock, state: clock.state === "overtime_paused" ? "overtime_live" : "live", startedAtServer: now, serverNow: now };
  if (command === "pause") return { ...clock, state: clock.state === "overtime_live" ? "overtime_paused" : "paused", elapsedMsBeforeStart: elapsed, startedAtServer: undefined, serverNow: now };
  if (command === "reset") return { ...clock, state: "ready", elapsedMsBeforeStart: 0, startedAtServer: undefined, serverNow: now };
  if (command === "finish_regulation") return { ...clock, state: "regulation_ended", elapsedMsBeforeStart: elapsed, startedAtServer: undefined, serverNow: now };
  return { ...clock, state: "tie_break", elapsedMsBeforeStart: elapsed, startedAtServer: undefined, serverNow: now };
}

export function OptimisticMatchClock(props: OptimisticMatchClockProps) {
  const router = useRouter();
  const [clock, setClock] = useState<ClockView>({ state: props.state, startedAtServer: props.startedAtServer, elapsedMsBeforeStart: props.elapsedMsBeforeStart, durationLimitMs: props.durationLimitMs, serverNow: props.serverNow, revision: props.revision });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const storageKey = useMemo(() => `rankae:clock:${props.matchId}`, [props.matchId]);

  async function run(command: Command, action: ClockAction) {
    if (busyRef.current) return;
    busyRef.current = true;
    const before = clock;
    const optimistic = optimisticTransition(before, command);
    setClock(optimistic);
    setBusy(true);
    setError("");
    localStorage.setItem(storageKey, JSON.stringify({ ...optimistic, savedAt: Date.now() }));
    const data = new FormData();
    data.set("idempotencyKey", crypto.randomUUID());
    data.set("expectedRevision", String(before.revision));
    try {
      const result = await action(data);
      if (result.status !== "success" || !result.state || result.elapsedMsBeforeStart === undefined || !result.serverNow || result.revision === undefined || result.durationLimitMs === undefined) {
        setClock(before);
        setError(result.message ?? "Não foi possível atualizar o relógio.");
        return;
      }
      const confirmed: ClockView = { state: result.state, startedAtServer: result.startedAtServer, elapsedMsBeforeStart: result.elapsedMsBeforeStart, durationLimitMs: result.durationLimitMs, serverNow: result.serverNow, revision: result.revision };
      setClock(confirmed);
      localStorage.setItem(storageKey, JSON.stringify({ ...confirmed, savedAt: Date.now() }));
      if (command === "finish_regulation" || command === "finish_overtime") router.refresh();
    } catch {
      setClock(before);
      setError("Sem conexão. O relógio continuou no estado anterior.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function addTime(formData: FormData) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    formData.set("idempotencyKey", crypto.randomUUID());
    formData.set("expectedRevision", String(clock.revision));
    try {
      const result = await props.adjustAction(formData);
      if (result.status !== "success" || !result.state || result.elapsedMsBeforeStart === undefined || !result.serverNow || result.revision === undefined || result.durationLimitMs === undefined) {
        setError(result.message ?? "Não foi possível adicionar tempo.");
        return;
      }
      setClock({ state: result.state, startedAtServer: result.startedAtServer, elapsedMsBeforeStart: result.elapsedMsBeforeStart, durationLimitMs: result.durationLimitMs, serverNow: result.serverNow, revision: result.revision });
      setError("");
    } catch { setError("Não foi possível adicionar tempo."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <>
    <div className="timer-bar"><LiveTimer {...clock} /></div>
    <div className="score-actions optimistic-clock-actions" aria-busy={busy}>
      {clock.state === "ready" && <button className="button button-primary" disabled={busy} type="button" onClick={() => run("start", props.startAction)}>Iniciar cronômetro</button>}
      {running(clock.state) && <button className="button button-secondary" disabled={busy} type="button" onClick={() => run("pause", props.pauseAction)}>Pausar</button>}
      {(clock.state === "paused" || clock.state === "overtime_paused") && <button className="button button-primary" disabled={busy} type="button" onClick={() => run("resume", props.resumeAction)}>Retomar</button>}
      {!['completed','cancelled'].includes(clock.state) && <button className="button button-danger" disabled={busy} type="button" onClick={() => run("reset", props.resetAction)}>Reiniciar</button>}
      {props.showOvertimeOption && (clock.state === "live" || clock.state === "paused") && <button className="button button-secondary" disabled={busy} type="button" onClick={() => run("finish_regulation", props.finishRegulationAction)}>Ir para prorrogação</button>}
      {['live','paused','overtime_live','overtime_paused'].includes(clock.state) && <form action={addTime} className="cluster"><label className="sr-only" htmlFor="clock-add-minutes">Minutos para adicionar</label><select id="clock-add-minutes" name="minutes" className="select" defaultValue="1"><option value="1">+1 min</option><option value="2">+2 min</option><option value="3">+3 min</option><option value="5">+5 min</option><option value="10">+10 min</option></select><button className="button button-secondary" disabled={busy}>Adicionar tempo</button></form>}
    </div>
    {error && <div className="flash-toast error" role="alert">{error}</div>}
  </>;
}
