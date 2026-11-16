"use client";

import { useState } from "react";

export type AccountAccess = { name: string | null; mode: "trial" | "active"; paying: boolean; rankaLimit: number; sessionLimit: number | null; trialDays: number | null };

export function AccountAccessFields({ trialDays, initial }: { trialDays: number; initial?: AccountAccess }) {
  const [mode, setMode] = useState(initial?.mode ?? "trial");
  return <>
    <label className="field">Nome do responsável<input className="input" name="name" defaultValue={initial?.name ?? ""} required minLength={2} maxLength={100} /></label>
    <label className="field">Tipo da conta<select className="select" name="mode" value={mode} onChange={(event) => setMode(event.target.value === "trial" ? "trial" : "active")}><option value="trial">Teste</option><option value="active">Ativa</option></select></label>
    <label className="field">Limite de rankas<input className="input" name="rankaLimit" type="number" min="1" max="100" defaultValue={initial?.rankaLimit ?? 1} required /></label>
    {mode === "trial" ? <>
      <label className="field">Dias de futebol incluídos<input className="input" name="sessionLimit" type="number" min="1" max="100" defaultValue={initial?.sessionLimit ?? 1} required /></label>
      <label className="field">Prazo para usar o teste (dias)<input className="input" name="trialDays" type="number" min="1" max="365" defaultValue={initial?.trialDays ?? trialDays} required /></label>
    </> : <label className="field checkbox-field"><input type="checkbox" name="paying" defaultChecked={initial?.paying ?? false} /> Conta pagante</label>}
  </>;
}
