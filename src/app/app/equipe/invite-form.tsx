"use client";

import { useActionState } from "react";
import { InviteLink } from "@/components/invite-link";
import { createTeamInvite } from "./actions";

export function TeamInviteForm({ orgId, full }: { orgId: string; full: boolean }) {
  const [result, action, pending] = useActionState(createTeamInvite.bind(null, orgId), {});
  return <form className="stack" action={action}>
    {full ? <p className="muted">Todas as vagas estão ocupadas ou reservadas.</p> : <>
      <label className="field">E-mail do colaborador<input type="email" className="input" name="email" maxLength={254} required /></label>
      <button className="button button-primary" disabled={pending}>{pending ? "Gerando convite" : "Gerar convite"}</button>
    </>}
    {result.error && <p className="notice notice-warning" role="alert">{result.error}</p>}
    {result.link && !pending && <InviteLink link={result.link} />}
  </form>;
}
