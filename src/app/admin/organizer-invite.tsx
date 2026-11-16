"use client";

import { useActionState } from "react";
import { InviteLink } from "@/components/invite-link";
import { inviteOrganizerAction } from "./actions";
import { AccountAccessFields } from "./account-access-fields";

export function OrganizerInvite({ trialDays }: { trialDays: number }) {
  const [result, action, pending] = useActionState(inviteOrganizerAction, {});
  return <form className="admin-plan-form" action={action}>
    <label className="field">E-mail do novo organizador<input type="email" name="email" className="input" maxLength={254} required /></label>
    <AccountAccessFields trialDays={trialDays} />
    <button className="button button-primary" disabled={pending}>{pending ? "Gerando…" : "Gerar link de convite"}</button>
    {result.error && <p role="alert">{result.error}</p>}
    {result.link && !pending && <InviteLink link={result.link} />}
  </form>;
}
