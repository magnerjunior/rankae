import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveIncidentAction, updateCommercialPlanAction } from "./actions";
import { AdminMfaSetup } from "@/components/admin-mfa-setup";
import { TrustRepository } from "@/data/supabase/trust-repository";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/login-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { AdminAccounts } from "./accounts";

export const metadata = { title: "Acesso à conta · Rankaê", robots: { index: false, follow: false } };

const routeLabels: Record<string, string> = {
  public_snapshot: "Portal público",
  record_match_event: "Registrar evento",
  transition_match_clock: "Comando do relógio",
  generate_session_squads: "Formar times",
  prepare_next_match: "Preparar partida",
  complete_match_and_rotate: "Rodar times",
  batch_mark_contributions: "Marcar contribuições",
  finish_ranka_session: "Encerrar ranka",
};
const reais = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2);

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  if (!hasSupabaseConfig()) notFound();
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return <main className="page trust-page">
    <header className="page-heading"><h1 className="display">Acesse sua conta</h1></header>
    <section className="panel login-card"><LoginForm admin /></section>
  </main>;
  const query = await searchParams;
  const repository = new TrustRepository(client);
  const capability = await repository.adminCapability();
  if (!capability.active) notFound();
  if (!capability.aal2) return <main className="page trust-page"><header className="between"><Link className="brand" href="/app"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><Link className="button button-secondary button-small" href="/app">Voltar</Link></header><header className="page-heading"><span className="eyebrow">Administração da plataforma</span><h1 className="display">Confirme que é você.</h1><p>Ative ou confirme a autenticação em duas etapas para acessar o painel global.</p></header><AdminMfaSetup /></main>;

  const [overview, plan] = await Promise.all([repository.adminOverview("Revisão operacional do painel global"), repository.commercialPlan()]);
  return <main className="page trust-page">
    <header className="between"><Link className="brand" href="/app"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><span className="badge badge-green">SUPERADMIN · AAL2</span></header>
    <header className="page-heading"><span className="eyebrow">Administração da plataforma</span><h1 className="display">Operação e plano.</h1><p>Acompanhe a saúde do produto e ajuste a oferta exibida na página pública.</p></header>
    {query.erro && <div className="notice notice-warning">A operação não foi concluída. Revise os valores, o motivo e sua sessão MFA.</div>}
    {query.sucesso === "resolvido" && <div className="notice">Incidente encerrado.</div>}
    {query.sucesso === "plano" && <div className="notice">Plano atualizado na página pública.</div>}
    {query.sucesso === "convite" && <div className="notice">Convite enviado ao organizador.</div>}
    {query.sucesso === "teste" && <div className="notice">Teste liberado para a conta.</div>}
    {query.sucesso === "recebimento" && <div className="notice">Recebimento registrado.</div>}

    <section className="panel admin-section">
      <div className="panel-head"><div><span className="eyebrow">Oferta pública</span><h2 className="panel-title display">Plano comercial</h2></div><span className="badge">valores em reais</span></div>
      <form action={updateCommercialPlanAction} className="admin-plan-form">
        <label className="field">Mensalidade<input className="input" name="monthlyPrice" type="number" min="1" step="0.01" defaultValue={reais(plan.monthlyPriceCents)} required /></label>
        <label className="field">Preço anterior<input className="input" name="compareAtPrice" type="number" min="1" step="0.01" defaultValue={reais(plan.compareAtPriceCents)} /></label>
        <label className="field">Ranka adicional<input className="input" name="extraRankaPrice" type="number" min="1" step="0.01" defaultValue={reais(plan.extraRankaPriceCents)} required /></label>
        <label className="field">Plano anual<input className="input" name="annualPrice" type="number" min="1" step="0.01" defaultValue={reais(plan.annualPriceCents)} /></label>
        <label className="field">Dias de teste<input className="input" name="trialDays" type="number" min="0" max="90" defaultValue={plan.trialDays} required /></label>
        <label className="field admin-plan-reason">Motivo da alteração<input className="input" name="reason" minLength={8} maxLength={500} placeholder="Ex.: ajuste da oferta de lançamento" required /></label>
        <button className="button button-primary">Salvar plano</button>
      </form>
    </section>

    <AdminAccounts client={client} />

    <section className="metric-grid admin-section"><article className="metric"><span>Organizações</span><strong>{overview.counts.organizations}</strong></article><article className="metric"><span>Rankas</span><strong>{overview.counts.rankas}</strong></article><article className="metric"><span>Pedidos LGPD abertos</span><strong>{overview.counts.openPrivacyRequests}</strong></article><article className="metric"><span>Incidentes abertos</span><strong>{overview.counts.openIncidents}</strong></article></section>

    <section className="panel admin-section"><div className="panel-head"><div><span className="eyebrow">Última hora</span><h2 className="panel-title display">Rotas críticas</h2></div><span className="badge">mínimo 50 amostras para alerta</span></div>{overview.metrics.length === 0 ? <div className="empty"><strong>Sem amostras na última hora</strong><span>As métricas surgem com uso real das operações críticas.</span></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Rota</th><th>Amostras</th><th>p50</th><th>p95</th><th>p99</th><th>5xx</th></tr></thead><tbody>{overview.metrics.map((metric) => <tr key={metric.route_key}><td>{routeLabels[metric.route_key] ?? metric.route_key}</td><td>{metric.samples}</td><td>{metric.p50Ms} ms</td><td>{metric.p95Ms} ms</td><td>{metric.p99Ms} ms</td><td>{metric.errorPercent}%</td></tr>)}</tbody></table></div>}</section>

    <section className="panel admin-section"><div className="panel-head"><div><span className="eyebrow">Alertas internos</span><h2 className="panel-title display">Incidentes recentes</h2></div><Link className="button button-quiet button-small" href="/api/health">Health check</Link></div>{overview.incidents.length === 0 ? <div className="empty"><strong>Nenhum incidente registrado</strong><span>p95 e erros são avaliados em janelas com volume mínimo.</span></div> : <div className="incident-list">{overview.incidents.map((incident) => <article className="incident-row" key={incident.id}><div><span className={`badge ${incident.severity === "critical" ? "badge-red" : "badge-demo"}`}>{incident.severity}</span><h3>{incident.title}</h3><small>{incident.routeKey ? routeLabels[incident.routeKey] ?? incident.routeKey : incident.kind} · {new Date(incident.lastSeenAt).toLocaleString("pt-BR")}</small></div>{incident.status !== "resolved" && <form action={resolveIncidentAction} className="incident-resolution"><input type="hidden" name="incidentId" value={incident.id} /><input className="input" name="reason" minLength={8} maxLength={500} required placeholder="Motivo e evidência da resolução" /><button className="button button-secondary button-small">Resolver</button></form>}</article>)}</div>}</section>
  </main>;
}
