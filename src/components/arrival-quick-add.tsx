"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ArrivalActionState } from "@/app/app/rankas/[rankaId]/actions";
import type { Player } from "@/domain/ranka/types";

const initialState: ArrivalActionState = { status: "idle" };

export function ArrivalQuickAdd({ players, action }: { players: Player[]; action: (state: ArrivalActionState, formData: FormData) => Promise<ArrivalActionState> }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    inputRef.current?.focus();
    router.refresh();
  }, [state, router]);

  return <div className="quick-arrival">
    <form ref={formRef} action={formAction} className="quick-arrival-form">
      <label className="sr-only" htmlFor="arrival-name">Nome do jogador</label>
      <input ref={inputRef} id="arrival-name" className="quick-arrival-name" name="fullName" list="known-players" autoComplete="off" autoCapitalize="words" required minLength={2} maxLength={120} placeholder="Digite o nome" />
      <datalist id="known-players">{players.map((player) => <option key={player.id} value={player.fullName} />)}</datalist>
      <label className="sr-only" htmlFor="arrival-role">Posição</label>
      <select id="arrival-role" className="quick-arrival-role" name="role" defaultValue="line" aria-label="Posição"><option value="line">Linha</option><option value="keeper">Goleiro</option></select>
      <button className="quick-arrival-confirm" disabled={pending} aria-label="Confirmar chegada">{pending ? "…" : "✓"}</button>
    </form>
    {state.message && <p className={`quick-arrival-message ${state.status}`} role="status">{state.message}</p>}
  </div>;
}
