"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { projectScore } from "@/domain/ranka/rules";
import type { LiveMatch } from "@/data/ports/ranka-repository";
import { kitStyle, type KitColor } from "@/domain/ranka/kit-colors";
import { useOptionalMatchScore } from "@/components/optimistic-score";

type Kits = { yellow: KitColor; red: KitColor };

export function MatchStatusBar({ match, href, yellowTeam, redTeam, collapse, kits }: { match: LiveMatch; href: string; yellowTeam?: number; redTeam?: number; collapse?: boolean; kits?: Kits }) {
  const optimistic = useOptionalMatchScore();
  const score = optimistic ?? projectScore(match.events);
  return <GameStatusBar href={href} state={match.state} score={`${score.yellow} × ${score.red}`} startedAt={match.startedAtServer} elapsedMs={match.elapsedMsBeforeStart} durationMs={match.durationLimitMs} serverNow={match.serverNow} label={match.state.includes("overtime") ? "Prorrogação" : `Jogo ${match.ordinal}`} yellowTeam={yellowTeam} redTeam={redTeam} collapse={collapse} kits={kits} />;
}

export function GameStatusBar({
  href,
  state,
  score,
  startedAt,
  elapsedMs,
  label,
  yellowTeam,
  redTeam,
  durationMs,
  serverNow,
  collapse,
  kits,
}: {
  href: string;
  state?: string;
  score?: string;
  startedAt?: string;
  elapsedMs: number;
  label: string;
  yellowTeam?: number;
  redTeam?: number;
  durationMs?: number;
  serverNow?: string;
  collapse?: boolean;
  kits?: Kits;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [away, setAway] = useState(false);
  const running = state === "live" || state === "overtime_live";
  useEffect(() => {
    if (!running) return;
    const update = () => setNow(Date.now());
    const sync = window.setTimeout(() => {
      setOffset(serverNow ? Date.parse(serverNow) - Date.now() : 0);
      update();
    }, 0);
    const timer = window.setInterval(update, 500);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(sync);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [running, serverNow]);
  useEffect(() => {
    const scoreboard = collapse && document.querySelector(".scoreboard .score-sides");
    if (!scoreboard) return;
    const bounds = scoreboard.closest(".app-shell")?.querySelector(".topbar")?.getBoundingClientRect();
    const observer = new IntersectionObserver(([entry]) => {
      setAway(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
    }, { rootMargin: `-${Math.ceil(bounds?.height ?? 60)}px 0px 0px 0px` });
    observer.observe(scoreboard);
    return () => observer.disconnect();
  }, [collapse]);
  const total =
    elapsedMs +
    (running && startedAt
      ? Math.max(0, now + offset - Date.parse(startedAt))
      : 0);
  const seconds = Math.ceil(Math.max(0, durationMs === undefined ? total : durationMs - total) / 1000);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  if (collapse && !away) return null;
  return (
    <Link className={`game-status-bar ${running ? "live" : ""} ${durationMs !== undefined ? "game-status-clock" : ""} ${collapse ? "game-status-overlay" : ""}`} href={href} onClick={collapse ? (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      document.querySelector(".scoreboard")?.scrollIntoView();
    } : undefined}>
      <span className="game-status-title">
        <i />
        {label}
      </span>
      {yellowTeam && redTeam && (
        <span className="game-status-teams" aria-label={`Time ${yellowTeam} contra time ${redTeam}`}>
          <span className="status-team" style={kitStyle(kits?.yellow ?? "yellow")}>T{yellowTeam}</span>
          <span className="status-team" style={kitStyle(kits?.red ?? "red")}>T{redTeam}</span>
        </span>
      )}
      {score && <strong>{score}</strong>}
      <b>{clock}</b>
      <em>Continuar</em>
    </Link>
  );
}
