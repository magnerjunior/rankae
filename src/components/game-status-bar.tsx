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
}: {
  href: string;
  state?: string;
  score?: string;
  startedAt?: string;
  elapsedMs: number;
  label: string;
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
      <span>
        <i />
        {label}
      </span>
      {score && <strong>{score}</strong>}
      <b>{clock}</b>
      <em>Continuar</em>
    </Link>
  );
}
