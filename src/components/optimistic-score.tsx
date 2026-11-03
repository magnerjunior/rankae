"use client";

import { useEffect, useState } from "react";

export const SCORE_EVENT = "rankae:optimistic-score";

export function OptimisticScore({ matchId, side, initial }: { matchId: string; side: "yellow" | "red"; initial: number }) {
  const [score, setScore] = useState(initial);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ matchId: string; side: "yellow" | "red"; delta: number }>).detail;
      if (detail.matchId === matchId && detail.side === side) setScore((current) => Math.max(0, current + detail.delta));
    };
    window.addEventListener(SCORE_EVENT, update);
    return () => window.removeEventListener(SCORE_EVENT, update);
  }, [matchId, side]);

  return <div className="score-number" aria-live="polite">{score}</div>;
}
