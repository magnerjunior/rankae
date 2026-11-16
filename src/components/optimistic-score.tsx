"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Side = "yellow" | "red";
type Score = Record<Side, number>;
const ScoreContext = createContext<{ score: Score; addGoal: (id: string, side: Side) => void; rejectGoal: (id: string) => void } | null>(null);

export function MatchScoreProvider({ initial, recordedKeys, children }: { initial: Score; recordedKeys: string[]; children: ReactNode }) {
  const [goals, setGoals] = useState<{ id: string; side: Side }[]>([]);
  const recorded = new Set(recordedKeys);
  const score = { ...initial };
  for (const goal of goals) if (!recorded.has(goal.id)) score[goal.side] += 1;
  return <ScoreContext.Provider value={{
    score,
    addGoal: (id, side) => setGoals((current) => [...current.filter((goal) => !recorded.has(goal.id)), { id, side }]),
    rejectGoal: (id) => setGoals((current) => current.filter((goal) => goal.id !== id)),
  }}>{children}</ScoreContext.Provider>;
}

export function useMatchScore() {
  const score = useContext(ScoreContext);
  if (!score) throw new Error("MatchScoreProvider is required");
  return score;
}

export function OptimisticScore({ side }: { side: Side }) {
  const { score } = useMatchScore();
  return <div className="score-number" aria-live="polite">{score[side]}</div>;
}
