"use client";

import { useActionState } from "react";
import { joinTeam } from "./actions";

export function JoinTeamForm({ inviteId, signedIn }: { inviteId: string; signedIn: boolean }) {
  const [result, action, pending] = useActionState(joinTeam.bind(null, inviteId), {});
  return <div className="login-card stack">
    {signedIn && <form action={action}><button className="button button-primary" name="intent" value="accept" disabled={pending}>Aceitar convite</button></form>}
    {result.sent && <>
      <p className="notice" role="status">Enviamos a confirmação para o e-mail do convite. Abra o link na mesma janela do navegador ou informe o código, se ele estiver no e-mail.</p>
      <form className="stack" action={action}>
        <label className="field">Código de confirmação<input className="input" name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={10} /></label>
        <button className="button button-primary" name="intent" value="verify" disabled={pending}>Confirmar código</button>
      </form>
    </>}
    <form action={action}><button className={`button ${signedIn || result.sent ? "button-secondary" : "button-primary"}`} name="intent" value="request" disabled={pending}>{result.sent ? "Reenviar e-mail" : "Confirmar pelo meu e-mail"}</button></form>
    {result.error && <p className="notice notice-warning" role="alert">{result.error}</p>}
  </div>;
}
