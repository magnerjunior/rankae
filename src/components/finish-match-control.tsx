"use client";

import { useEffect, useId, useRef } from "react";
import { FastMutationForm } from "@/components/fast-mutation-form";
import type { FastMutationResult } from "@/app/app/rankas/[rankaId]/actions";

export function FinishMatchControl({ action, ruleReached, winnerLabel, promptKey }: { action: (formData: FormData) => Promise<FastMutationResult>; ruleReached: boolean; winnerLabel?: string; promptKey: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lastPrompt = useRef<string>(null);
  const titleId = useId();
  useEffect(() => {
    if (!ruleReached || lastPrompt.current === promptKey) return;
    lastPrompt.current = promptKey;
    try {
      const storageKey = `rankae:finish-prompt:${promptKey}`;
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch { /* The ref still keeps the prompt from repeating on this screen. */ }
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [ruleReached, promptKey]);
  return <>
    <button type="button" className="button button-primary" onClick={() => dialog.current?.showModal()}>{ruleReached ? "Finalizar partida" : "Encerrar partida"}</button>
    <dialog ref={dialog} className="modal finish-match-dialog" aria-labelledby={titleId}>
      <h2 id={titleId}>{ruleReached ? "Fim de partida" : "Encerrar partida?"}</h2>
      <p>{ruleReached && winnerLabel ? `${winnerLabel} atingiu a regra de gols. ` : ""}O resultado ficará disponível para revisão. Você poderá iniciar o próximo jogo ou encerrar o ranka.</p>
      <div className="cluster"><button type="button" className="button button-secondary" onClick={() => dialog.current?.close()}>Continuar partida</button><FastMutationForm action={action}><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} /><button className="button button-danger">Finalizar partida</button></FastMutationForm></div>
    </dialog>
  </>;
}
