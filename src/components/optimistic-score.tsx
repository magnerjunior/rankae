"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { reachedMatchGoalRule } from "@/domain/ranka/rules";
import type { MatchEventMutationResult } from "@/app/app/rankas/[rankaId]/actions";
import type { LiveMatch } from "@/data/ports/ranka-repository";

type Side = "yellow" | "red";
type Score = Record<Side, number>;
type QueuedGoal = { id: string; side: Side; capturedAt: number; elapsed: number; startedAt?: string; fields: [string, string][]; saved?: boolean };
const ScoreContext = createContext<{ score: Score; enqueue: (form: FormData, side: Side) => boolean; frozenElapsed?: number; pending: number } | null>(null);

export function MatchScoreProvider({ initial, recordedKeys, children, storagePrefix, record, clock, targetGoals, targetDifference }: {
  initial: Score; recordedKeys: string[]; children: ReactNode; storagePrefix: string;
  record: (form: FormData) => Promise<MatchEventMutationResult>;
  clock: Pick<LiveMatch, "state" | "elapsedMsBeforeStart" | "startedAtServer" | "serverNow" | "durationLimitMs">;
  targetGoals: number; targetDifference: number;
}) {
  const router = useRouter();
  const [goals, setGoals] = useState<QueuedGoal[]>([]);
  const [message, setMessage] = useState("");
  const anchor = useRef(0);
  const sending = useRef(false);
  useEffect(() => { anchor.current = Date.now(); }, [clock.serverNow]);
  useEffect(() => {
    const load = () => {
      const restored: QueuedGoal[] = [];
      try {
        for (const key of Object.keys(localStorage).filter((entry) => entry.startsWith(storagePrefix))) {
          const goal = JSON.parse(localStorage.getItem(key) ?? "null") as QueuedGoal | null;
          if (goal && Array.isArray(goal.fields) && Date.now() - goal.capturedAt < 86_400_000) restored.push(goal);
          else localStorage.removeItem(key);
        }
      } catch { /* The active tab can still send events if storage is unavailable. */ }
      setGoals((current) => [...new Map([...restored, ...current].map((goal) => [goal.id, goal])).values()].sort((a, b) => a.capturedAt - b.capturedAt));
    };
    const timer = setTimeout(load, 0);
    window.addEventListener("storage", load);
    return () => { clearTimeout(timer); window.removeEventListener("storage", load); };
  }, [storagePrefix]);

  useEffect(() => {
    const known = new Set(recordedKeys);
    const waiting = goals.filter((goal) => !goal.saved && !known.has(goal.id));
    const removeStoredGoal = (goal: QueuedGoal) => { try { localStorage.removeItem(storagePrefix + goal.id); } catch { /* Storage is optional. */ } };
    for (const goal of goals) if (known.has(goal.id)) removeStoredGoal(goal);
    if (!waiting.length) return;
    async function send() {
      if (!navigator.onLine || sending.current) return;
      const goal = waiting[0];
      sending.current = true;
      try {
        const form = new FormData();
        for (const [key, value] of goal.fields) form.set(key, value);
        form.set("idempotencyKey", goal.id);
        form.set("clockStartedAt", goal.startedAt ?? "");
        form.set("capturedElapsedMs", String(goal.elapsed));
        const result = await record(form);
        if (result.retryable) return;
        removeStoredGoal(goal);
        setGoals((current) => result.status === "success" ? current.map((item) => item.id === goal.id ? { ...item, saved: true } : item) : current.filter((item) => item.id !== goal.id));
        setMessage(result.status === "error" ? result.message : "");
        router.refresh();
      } catch { /* Retry with the same event ID when connectivity returns. */ }
      finally { sending.current = false; }
    }
    const first = setTimeout(send, 0);
    const retry = setInterval(send, 5000);
    window.addEventListener("online", send);
    return () => { clearTimeout(first); clearInterval(retry); window.removeEventListener("online", send); };
  }, [goals, recordedKeys, record, router, storagePrefix]);

  const recorded = new Set(recordedKeys);
  const score = { ...initial };
  let frozenElapsed: number | undefined;
  for (const goal of goals) {
    if (recorded.has(goal.id)) continue;
    const ruleBefore = reachedMatchGoalRule(score, targetGoals, targetDifference);
    score[goal.side] += 1;
    if (!ruleBefore && reachedMatchGoalRule(score, targetGoals, targetDifference)) frozenElapsed ??= goal.elapsed;
  }
  const pending = goals.filter((goal) => !goal.saved && !recorded.has(goal.id)).length;
  return <ScoreContext.Provider value={{
    score, frozenElapsed, pending,
    enqueue: (form, side) => {
      if (pending >= 20 || frozenElapsed !== undefined) return false;
      const now = Date.now();
      const startedAt = clock.startedAtServer;
      const elapsed = startedAt ? clock.elapsedMsBeforeStart + Math.max(0, Date.parse(clock.serverNow) - Date.parse(startedAt) + now - (anchor.current || now)) : clock.elapsedMsBeforeStart;
      const goal = { id: crypto.randomUUID(), capturedAt: now, side, startedAt,
        elapsed: Math.min(clock.durationLimitMs, Math.round(elapsed)),
        fields: [...form.entries()].flatMap(([key, value]) => typeof value === "string" ? [[key, value] as [string, string]] : []),
      };
      try { localStorage.setItem(storagePrefix + goal.id, JSON.stringify(goal)); }
      catch { if (!navigator.onLine) return false; }
      setGoals((current) => [...current.filter((item) => !recorded.has(item.id)), goal]);
      setMessage("");
      return true;
    },
  }}>{(pending > 0 || message) && <p className="match-sync-status" role="status">{message || `${pending} ${pending === 1 ? "gol aguardando" : "gols aguardando"} sincronização`}</p>}{children}</ScoreContext.Provider>;
}

export function useMatchScore() {
  const score = useContext(ScoreContext);
  if (!score) throw new Error("MatchScoreProvider is required");
  return score;
}

export function useOptionalMatchScore() {
  return useContext(ScoreContext)?.score;
}

export function useGoalClockFreeze() {
  return useContext(ScoreContext)?.frozenElapsed;
}

export function OptimisticScore({ side }: { side: Side }) {
  const { score } = useMatchScore();
  return <div className="score-number" aria-live="polite">{score[side]}</div>;
}
