import Link from "next/link";
import { rankaSections, type RankaSection } from "@/lib/navigation";

const bottomKeys: RankaSection[] = ["inicio", "chegada", "times", "partida", "estatisticas"];

function sectionHref(key: RankaSection, rankaId: string) {
  return key === "inicio" ? `/app/rankas/${rankaId}` : `/app/rankas/${rankaId}/${key}`;
}

export function RankaHeader({ title = "Ranka do Parque", subtitle = "Sessão demonstrativa" }: { title?: string; subtitle?: string }) {
  return (
    <div className="between" style={{width: "100%"}}>
      <span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span>
      <div style={{textAlign: "right"}}><strong style={{display: "block"}}>{title}</strong><small className="muted">{subtitle}</small></div>
    </div>
  );
}

export function BottomNav({ active, rankaId }: { active: RankaSection; rankaId: string }) {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {bottomKeys.map((key, index) => {
        const item = rankaSections.find((section) => section.key === key)!;
        return <Link key={key} className={`bottom-link ${active === key ? "active" : ""}`} href={sectionHref(key, rankaId)} aria-current={active === key ? "page" : undefined}><span aria-hidden="true">0{index + 1}</span><span>{item.short}</span></Link>;
      })}
    </nav>
  );
}

export function AppShell({ active, children, rankaId = "demo", title = "Ranka do Parque", demo = false }: { active: RankaSection; children: React.ReactNode; rankaId?: string; title?: string; demo?: boolean }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span>
        <nav className="sidebar-nav" aria-label="Seções do ranka">
          {rankaSections.map((item) => <Link key={item.key} href={sectionHref(item.key, rankaId)} className={`sidebar-link ${active === item.key ? "active" : ""}`} aria-current={active === item.key ? "page" : undefined}>{item.label}</Link>)}
        </nav>
        <div className="sidebar-foot"><span className={`badge ${demo ? "badge-demo" : "badge-green"}`}>{demo ? "DEMO LOCAL" : "CONECTADO"}</span><p>{demo ? "Dados fictícios. Alterações não persistem ao recarregar." : "Dados privados protegidos por autenticação e RLS."}</p>{!demo && <div className="sidebar-trust-links"><Link href="/app/privacidade">Privacidade</Link><Link href="/app/legal">Documentos</Link></div>}</div>
      </aside>
      <div className="app-main">
        <div className="demo-ribbon"><span aria-hidden="true">●</span> {demo ? "Modo demonstração — sem persistência ou autenticação real" : "Ambiente conectado — acesso de organizador verificado"}</div>
        <header className="topbar"><RankaHeader title={title} subtitle={demo ? "Sessão demonstrativa" : "Supabase · RLS ativo"} /></header>
        <main className="page">{children}</main>
        <BottomNav active={active} rankaId={rankaId} />
      </div>
    </div>
  );
}
