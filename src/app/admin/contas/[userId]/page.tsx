import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { AccountAccessFields, type AccountAccess } from "../../account-access-fields";
import { updateAccountAccessAction, updateTeamLimitAction } from "../../actions";
import { AdminNavigation } from "../../admin-navigation";

export const metadata = { title: "Dados da conta | Rankaê", robots: { index: false, follow: false } };

const dayStates: Record<string, string> = { planned: "Planejado", check_in: "Chegada", team_formation: "Formação de times", running: "Em andamento", paused: "Pausado", completed: "Encerrado" };
const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "medium" }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));

type AccountDetail = AccountAccess & {
  email: string; createdAt: string; expiresAt: string | null; sessionUsed: number | null;
  rankas: { id: string; name: string; organization: string; publicSlug: string | null; visibility: string; days: { date: string; state: string; matches: number }[] }[];
};

export default async function AccountDetailPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();
  const client = await requirePlatformAdmin();
  const [{ data, error }, teams] = await Promise.all([
    client.rpc("admin_get_account_detail", { p_user_id: userId }), client.rpc("admin_get_account_teams", { p_user_id: userId }),
  ]);
  if (error) throw new Error("Não foi possível carregar os dados da conta.");
  if (!data) notFound();
  const account = data as Omit<AccountDetail, "mode"> & { mode: AccountAccess["mode"] | "collaborator" };
  const { erro, sucesso } = await searchParams;
  return <main className="page trust-page admin-page">
    <AdminNavigation />
    <Link className="text-link" href="/admin#contas">Voltar para Contas e testes</Link>
    <header className="page-heading"><h1 className="display">{account.name ?? account.email}</h1><p>{account.email} · Conta criada em {dateLabel(account.createdAt)}</p></header>
    {sucesso && <p className="notice" role="status">Acesso atualizado.</p>}
    {erro && <p className="notice notice-warning" role="alert">{erro === "vagas" ? "O limite não pode ficar abaixo das vagas ocupadas e reservadas." : "Não foi possível salvar. Confira os dados da conta."}</p>}
    <section className="panel admin-section">
      <h2 className="panel-title display">Acesso</h2>
      {account.mode === "trial" && account.expiresAt && <p>{account.sessionUsed ?? 0} de {account.sessionLimit} dias de futebol usados · Prazo até {dateLabel(account.expiresAt)}</p>}
      {account.mode === "collaborator" && <p className="muted">Conta de colaborador. Selecione Teste ou Ativa para liberar rankas próprios.</p>}
      <form className="admin-plan-form" action={updateAccountAccessAction.bind(null, userId)}><AccountAccessFields initial={{ ...account, mode: account.mode === "collaborator" ? "active" : account.mode }} trialDays={30} /><button className="button button-primary">Salvar acesso</button></form>
    </section>
    <section className="panel admin-section" id="equipe">
      <h2 className="panel-title display">Vagas de colaboradores</h2>
      {teams.error ? <p className="muted">Não foi possível carregar os limites.</p> : !(teams.data as unknown[])?.length ? <p className="muted">Esta conta ainda não possui uma organização.</p> :
        (teams.data as { id: string; name: string; limit: number; used: number; pending: number }[]).map((team) => <form className="team-access-row" key={team.id} action={updateTeamLimitAction.bind(null, userId, team.id)}>
          <span><strong>{team.name}</strong><small>{team.used} ativos · {team.pending} convites pendentes</small></span>
          <label className="field">Limite de vagas<input className="input" name="limit" type="number" min={0} max={50} defaultValue={team.limit} required /></label>
          <button className="button button-secondary button-small">Salvar limite</button>
        </form>)}
    </section>
    <section className="panel admin-section">
      <div className="panel-head"><h2 className="panel-title display">Rankas da conta</h2><Link className="text-link" href="/admin#incidentes">Ver incidentes da plataforma</Link></div>
      {account.rankas.length === 0 && <p className="muted">Esta conta ainda não criou rankas.</p>}
      {account.rankas.map((ranka) => <details className="admin-account-create" key={ranka.id}>
        <summary><strong>{ranka.name}</strong> <small>· {ranka.organization}</small></summary>
        <Link className="button button-secondary button-small" href={`/admin/rankas/${ranka.id}`} prefetch={false}>Inspecionar ranka</Link>
        {ranka.publicSlug ? <Link className="text-link" href={`/r/${ranka.publicSlug}`} target="_blank" rel="noreferrer">Abrir página pública</Link> : <p className="muted">{ranka.visibility === "private_off" ? "Portal desativado." : "Portal com acesso restrito."}</p>}
        {ranka.days.length === 0 ? <p className="muted">Nenhum encontro registrado.</p> : <ul>{ranka.days.map((day, index) => <li key={`${day.date}-${index}`}>{dateLabel(day.date)} · {dayStates[day.state] ?? day.state} · {day.matches} {day.matches === 1 ? "partida" : "partidas"}</li>)}</ul>}
      </details>)}
    </section>
  </main>;
}
