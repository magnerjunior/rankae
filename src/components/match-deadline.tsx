"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { LiveMatch } from "@/data/ports/ranka-repository";
import { expireMatchClockAction } from "@/app/app/rankas/[rankaId]/actions";

let audio: AudioContext | undefined;
let lastWhistle: string | undefined;

export function enableMatchAudio() {
  if (typeof AudioContext === "undefined") return;
  audio ??= new AudioContext();
  void audio.resume().catch(() => undefined);
}

function whistle(phase: string, overtime: boolean) {
  if (!audio || audio.state !== "running" || document.hidden) return;
  if (lastWhistle === phase) return;
  lastWhistle = phase;
  const context = audio;
  for (const offset of overtime ? [0] : [0, 0.24, 0.48]) {
    const start = context.currentTime + offset;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(2450, start);
    tone.frequency.linearRampToValueAtTime(3100, start + 0.12);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.21);
    tone.connect(gain).connect(context.destination);
    tone.start(start);
    tone.stop(start + 0.22);
  }
}

export function MatchDeadline({ match }: { match: LiveMatch }) {
  const router = useRouter();
  const { id, state, startedAtServer, elapsedMsBeforeStart, durationLimitMs, serverNow } = match;
  const previous = useRef<{ id: string; phase: string; state: string; due: number }>(null);
  useEffect(() => {
    const last = previous.current;
    if (last?.id === id && last.state !== state && Math.abs(Date.now() - last.due) < 15_000 &&
      (state === "completed" || state === "overtime_live" || state === "tie_break")) {
      whistle(last.phase, state === "overtime_live");
    }
    previous.current = null;
    if (!startedAtServer || (state !== "live" && state !== "overtime_live")) return;
    const unlock = () => enableMatchAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    const remaining = Date.parse(startedAtServer) + durationLimitMs - elapsedMsBeforeStart - Date.parse(serverNow);
    const due = Date.now() + Math.max(0, remaining);
    const phase = `${id}:${startedAtServer}:${durationLimitMs}`;
    previous.current = { id, phase, state, due: Date.now() + remaining };
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let running = false;
    async function check() {
      if (disposed || document.hidden || running) return;
      if (Date.now() < due) {
        clearTimeout(timer);
        timer = setTimeout(check, due - Date.now() + 70);
        return;
      }
      running = true;
      try {
        const result = await expireMatchClockAction(id);
        if (result.changed && result.state && Date.now() - due < 15_000) whistle(phase, result.state === "overtime_live");
        if (disposed) return;
        if (result.state && result.state !== state) router.refresh();
        else timer = setTimeout(check, 5000);
      } catch {
        if (!disposed) timer = setTimeout(check, 5000);
      } finally {
        running = false;
      }
    }
    timer = setTimeout(check, Math.max(0, remaining) + 100);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [id, state, startedAtServer, elapsedMsBeforeStart, durationLimitMs, serverNow, router]);
  return null;
}
