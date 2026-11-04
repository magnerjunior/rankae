"use client";

import { useEffect, useState } from "react";
import { FastMutationForm } from "@/components/fast-mutation-form";
import type { FastMutationResult } from "@/app/app/rankas/[rankaId]/actions";

export function FinishMatchControl({ action, ruleReached, winnerLabel, promptKey }: { action: (formData: FormData) => Promise<FastMutationResult>; ruleReached: boolean; winnerLabel?: string; promptKey: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (ruleReached && !sessionStorage.getItem(`rankae:finish-prompt:${promptKey}`)) {
      sessionStorage.setItem(`rankae:finish-prompt:${promptKey}`, "1");
      const timer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [ruleReached, promptKey]);
  return <>
    <button type="button" className="button button-primary" onClick={() => setOpen(true)}>{ruleReached ? "Finalizar partida" : "Encerrar partida"}</button>
    {open && <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="finish-match-title" onClick={(event) => event.stopPropagation()}><h2 id="finish-match-title">{ruleReached ? "Fim de partida" : "Encerrar partida?"}</h2><p>{ruleReached && winnerLabel ? `${winnerLabel} venceu pela regra de gols. ` : ""}O resultado ficará disponível para revisão. Você poderá iniciar o próximo jogo ou encerrar o ranka.</p><div className="cluster"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Continuar partida</button><FastMutationForm action={action}><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} /><button className="button button-danger">Finalizar partida</button></FastMutationForm></div></div></div>}
  </>;
}
