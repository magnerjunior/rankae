"use client";

import { useActionState } from "react";
import { InviteLink } from "@/components/invite-link";
import { shareCourtDay } from "@/app/quadra/[linkId]/actions";

export function CourtShareControl({ sessionId }: { sessionId: string }) {
  const [result, action, pending] = useActionState(shareCourtDay.bind(null, sessionId), {});
  return <details className="panel court-share">
    <summary>Compartilhar acesso à quadra</summary>
    <p>Envie o link e o PIN à pessoa que vai ajudar. O acesso vale por até 24 horas ou até o fim do encontro.</p>
    <form action={action} className="cluster">
      <button className="button button-primary" name="mode" value="create" disabled={pending}>Gerar novo link e PIN</button>
      <button className="button button-secondary" name="mode" value="revoke" disabled={pending}>Revogar link</button>
    </form>
    {result.link && <><p><strong>PIN {result.pin}</strong></p><InviteLink link={result.link} /></>}
    {(result.error || result.message) && <p role="status">{result.error ?? result.message}</p>}
  </details>;
}
