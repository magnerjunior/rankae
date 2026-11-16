"use client";

import Link from "next/link";
import { useState } from "react";

const sections = [
  ["visao-geral", "Visão geral"], ["contas", "Contas"], ["financeiro", "Financeiro"],
  ["plano-comercial", "Plano"], ["incidentes", "Incidentes"], ["manutencao", "Manutenção"],
] as const;

export function AdminNavigation() {
  const [open, setOpen] = useState(false);
  return <header className="admin-nav glass-bar" data-expanded={open} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <Link className="brand" href="/admin#visao-geral" onClick={() => setOpen(false)} aria-label="Rankaê, administração"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link>
    <button type="button" className="button button-secondary button-small admin-nav-toggle" aria-expanded={open} aria-controls="admin-sections" onClick={() => setOpen(!open)}>{open ? "Fechar menu" : "Menu admin"}</button>
    <nav id="admin-sections" aria-label="Administração">
      {sections.map(([id, label]) => <Link key={id} href={`/admin#${id}`} prefetch={false} onClick={() => setOpen(false)}>{label}</Link>)}
      <Link href="/app" prefetch={false} onClick={() => setOpen(false)}>Voltar ao app</Link>
    </nav>
  </header>;
}
