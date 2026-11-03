"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function GameStatusBar({
  href,
  state,
  score,
  startedAt,
  elapsedMs,
  label,
  yellowTeam,
  redTeam,
}: {
  href: string;
  state?: string;
  score?: string;
  startedAt?: string;
  elapsedMs: number;
  label: string;
  yellowTeam?: number;
  redTeam?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const running = state === "live" || state === "overtime_live";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const total =
    elapsedMs +
    (running && startedAt
      ? Math.max(0, now - new Date(startedAt).getTime())
      : 0);
  const clock = `${String(Math.floor(total / 60000)).padStart(2, "0")}:${String(Math.floor(total / 1000) % 60).padStart(2, "0")}`;
  return (
    <Link className={`game-status-bar ${running ? "live" : ""}`} href={href}>
      <span className="game-status-title">
        <i />
        {label}
      </span>
      {yellowTeam && redTeam && (
        <span className="game-status-teams" aria-label={`Time ${yellowTeam} contra time ${redTeam}`}>
          <span className="status-team yellow">T{yellowTeam}</span>
          <span className="status-team red">T{redTeam}</span>
        </span>
      )}
      {score && <strong>{score}</strong>}
      <b>{clock}</b>
      <em>Continuar</em>
    </Link>
  );
}
