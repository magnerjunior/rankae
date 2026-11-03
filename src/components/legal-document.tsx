import Link from "next/link";
import type { LegalDraft } from "@/content/legal";

export function LegalDocument({ document }: { document: LegalDraft }) {
  return <main className="legal-page"><header className="legal-header"><Link className="brand" href="/"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><span className="badge badge-demo">MINUTA · REVISÃO JURÍDICA PENDENTE</span></header><article className="legal-document"><span className="eyebrow">Confiança e transparência</span><h1 className="display">{document.title}</h1><p className="legal-version">{document.version}</p><div className="notice notice-warning">Este documento ainda não foi publicado como política definitiva. Ele precisa de revisão por profissional jurídico brasileiro antes do uso comercial.</div><p className="legal-summary">{document.summary}</p>{document.sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}</article><LegalFooter /></main>;
}

export function LegalFooter() {
  return <footer className="legal-footer"><span>Rankaê · documentos em revisão</span><nav aria-label="Documentos legais"><Link href="/legal/termos">Termos</Link><Link href="/legal/privacidade">Privacidade</Link><Link href="/legal/cookies">Cookies</Link><Link href="/legal/direitos">Seus direitos</Link></nav></footer>;
}
