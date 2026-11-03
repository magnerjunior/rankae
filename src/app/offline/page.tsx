import Link from "next/link";

export default function OfflinePage() {
  return <main className="portal-gate"><Link className="brand" href="/"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><section className="portal-gate-card"><span className="eyebrow">Sem conexão</span><h1 className="display">A rede deu um tempo.</h1><p>O placar protegido não é guardado no cache compartilhado. Reconecte para buscar o snapshot mais recente.</p><Link className="button button-primary" href="/">Tentar novamente</Link></section></main>;
}

