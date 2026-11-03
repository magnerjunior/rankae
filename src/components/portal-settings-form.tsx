"use client";

import { useActionState, useMemo, useState } from "react";
import type { PortalSettingsActionState } from "@/app/app/rankas/[rankaId]/actions";

const initialState: PortalSettingsActionState = { status: "idle" };

export function PortalSettingsForm({ action, currentVisibility }: { action: (state: PortalSettingsActionState, formData: FormData) => Promise<PortalSettingsActionState>; currentVisibility: "public" | "unlisted" | "pin_protected" | "private_off" }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [visibility, setVisibility] = useState(currentVisibility);
  const [copied, setCopied] = useState(false);
  const absoluteLink = useMemo(() => state.sharePath && typeof window !== "undefined" ? `${window.location.origin}${state.sharePath}` : state.sharePath, [state.sharePath]);
  async function copyLink() {
    if (absoluteLink) {
      await navigator.clipboard.writeText(absoluteLink);
      setCopied(true);
    }
  }
  return <form className="stack" action={formAction}>
    <label className="field">Acesso ao portal
      <select className="select" name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}>
        <option value="private_off">Desativado</option>
        <option value="public">Público</option>
        <option value="unlisted">Link não listado</option>
        <option value="pin_protected">Link + PIN de 4 dígitos</option>
      </select>
    </label>
    {visibility === "pin_protected" && <label className="field">Novo PIN<input className="input mono" name="pin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" placeholder="0000" required /></label>}
    {(visibility === "unlisted" || visibility === "pin_protected") && <p className="muted portal-help">Ao salvar, você receberá um novo link para compartilhar. Quem receber o link poderá repassá-lo.</p>}
    {state.message && <div className={`notice ${state.status === "error" ? "notice-warning" : ""}`} role="status">{state.message}</div>}
    {absoluteLink && <div className="share-link"><code>{absoluteLink}</code><div className="cluster"><button className="button button-secondary button-small" type="button" onClick={copyLink}>{copied ? "Copiado" : "Copiar link"}</button><a className="button button-primary button-small" href={absoluteLink} target="_blank" rel="noreferrer">Testar portal</a></div></div>}
    <button className="button button-primary" disabled={pending}>{pending ? "Salvando…" : "Salvar acesso público"}</button>
  </form>;
}

