"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setKeeperWaiverAction } from "@/app/app/rankas/[rankaId]/actions";

export function KeeperWaiverControl({ rankaId, sessionId, revision, enabled }: { rankaId: string; sessionId: string; revision: number; enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="keeper-waiver-control">
    <div><strong>Isenção para goleiros</strong><small>Aplica ou remove a isenção de contribuição dos goleiros presentes nesta rodada.</small></div>
    <button className={`toggle ${enabled ? "on" : ""}`} type="button" aria-pressed={enabled} disabled={pending} onClick={async () => {
      setPending(true);
      setMessage("");
      try {
        const result = await setKeeperWaiverAction(rankaId, sessionId, revision, !enabled);
        setMessage(result.message);
        if (result.status === "success") router.refresh();
      } catch {
        setMessage("Não foi possível atualizar a regra. Tente novamente.");
      }
      setPending(false);
    }}><span className="sr-only">{enabled ? "Remover isenção" : "Isentar goleiros"}</span></button>
    {message && <small className="keeper-waiver-message" role="status">{message}</small>}
  </section>;
}
