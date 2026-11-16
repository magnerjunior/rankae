"use client";

import { useActionState, useState } from "react";
import { inviteOrganizerAction } from "./actions";

export function OrganizerInvite() {
  const [result, action, pending] = useActionState(inviteOrganizerAction, {});
  const [copied, setCopied] = useState<string>();
  return <form className="admin-plan-form" action={action}>
    <label className="field">E-mail do novo organizador<input type="email" name="email" className="input" maxLength={254} required /></label>
    <button className="button button-primary" disabled={pending}>{pending ? "Gerando…" : "Gerar link de convite"}</button>
    {result.error && <p role="alert">{result.error}</p>}
    {result.link && !pending && <div className="field admin-plan-reason">
      <label htmlFor="organizer-invite-link">Link de acesso para enviar ao organizador</label>
      <input className="input" id="organizer-invite-link" readOnly value={result.link} onFocus={(event) => event.currentTarget.select()} />
      <button className="button button-secondary" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(result.link!); setCopied(result.link); }
        catch { document.getElementById("organizer-invite-link")?.focus(); }
      }}>{copied === result.link ? "Copiado" : "Copiar link"}</button>
    </div>}
  </form>;
}
