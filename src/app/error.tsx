"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="status-page">
      <section className="status-card" aria-labelledby="error-title">
        <span className="brand status-brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Rankaê</span>
        </span>
        <p className="status-code display" aria-hidden="true">Ops!</p>
        <span className="eyebrow">Falha temporária</span>
        <h1 className="display" id="error-title">Não deu para carregar essa jogada.</h1>
        <p>Nenhuma ação foi confirmada. Tente novamente; se a conexão continuar instável, volte à lista de rankas.</p>
        <div className="status-actions">
          <button className="button button-primary" type="button" onClick={reset}>Tentar novamente</button>
          <Link className="button button-secondary" href="/app">Meus rankas</Link>
        </div>
      </section>
    </main>
  );
}
