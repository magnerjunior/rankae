"use client";

import { useActionState } from "react";
import { InviteLink } from "@/components/invite-link";
import { createTeamInvite } from "./actions";

export function TeamInviteForm({ orgId, rankaId, full }: { orgId: string; rankaId?: string; full: boolean }) {
  const [result, action, pending] = useActionState(createTeamInvite.bind(null, orgId, rankaId), {});
  return <form className="stack" action={action}>
    {full ? <p className="muted">Todas as vagas estão ocupadas ou reservadas.</p> : <>
      <button className="button button-primary" name="operation" value="generate" disabled={pending}>{pending ? "Gerando convite" : "Gerar convite"}</button>
    </>}
    {result.error && <p className="notice notice-warning" role="alert">{result.error}</p>}
    {result.link && !pending && <InviteLink link={result.link} />}
  </form>;
}
