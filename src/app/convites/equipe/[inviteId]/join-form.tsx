"use client";

import { useActionState, useState } from "react";
import { joinTeam } from "./actions";

function PasswordField({ name, label, existing }: { name: string; label: string; existing: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label className="field">{label}<span className="invite-password">
    <input className="input" type={visible ? "text" : "password"} name={name} autoComplete={existing ? "current-password" : "new-password"} required minLength={8} maxLength={72} />
    <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>{visible && <path d="m4 4 16 16"/>}</svg>
    </button>
  </span></label>;
}

export function JoinTeamForm({ inviteId, signedIn }: { inviteId: string; signedIn: boolean }) {
  const [result, action, pending] = useActionState(joinTeam.bind(null, inviteId), {});
  const [existing, setExisting] = useState(false);
  return <div className="login-card stack">
    {signedIn && <form action={action}><button className="button button-secondary" name="mode" value="accept" disabled={pending}>Aceitar com a conta atual</button></form>}
    <form className="stack" action={action}>
      <input type="hidden" name="mode" value={existing ? "sign_in" : "register"} />
      {!existing && <label className="field">Nome<input className="input" name="name" autoComplete="name" required maxLength={80} /></label>}
      <label className="field">E-mail<input className="input" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <PasswordField name="password" label="Senha" existing={existing} />
      {!existing && <PasswordField name="confirmPassword" label="Confirme a senha" existing={false} />}
      <button className="button button-primary" disabled={pending}>{pending ? "Entrando…" : existing ? "Entrar e aceitar" : "Criar conta e entrar"}</button>
    </form>
    <button type="button" className="button button-secondary" onClick={() => setExisting(!existing)}>{existing ? "Criar uma conta" : "Já tenho conta"}</button>
    {result.error && <p className="notice notice-warning" role="alert">{result.error}</p>}
  </div>;
}
