import Link from "next/link";

export default function NotFound() {
  return (
    <main className="status-page">
      <section className="status-card" aria-labelledby="not-found-title">
        <span className="brand status-brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Rankaê</span>
        </span>
        <p className="status-code display" aria-hidden="true">404</p>
        <span className="eyebrow">Bola fora</span>
        <h1 className="display" id="not-found-title">Essa página não está em campo.</h1>
        <p>O endereço pode estar incorreto ou o conteúdo pode ter sido removido. Volte para seus rankas e continue a organização da pelada.</p>
        <div className="status-actions">
          <Link className="button button-primary" href="/app">Voltar aos meus rankas</Link>
          <Link className="button button-secondary" href="/">Ir para o início</Link>
        </div>
      </section>
    </main>
  );
}
