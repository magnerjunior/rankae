import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";
import { siteUrl } from "@/lib/site-url";
import { InviteLink } from "@/components/invite-link";
import { removeTeamAccess } from "./actions";
import { TeamInviteForm } from "./invite-form";

type Team = { id: string; name: string; limit: number; members: { id: string; email: string }[]; invites: { id: string; email: string; expiresAt: string }[] };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  const client = await createClient();
  await requireUserId({ client });
  const [{ data, error }, { erro, sucesso }] = await Promise.all([client.rpc("get_owned_teams"), searchParams]);
  const teams = (data ?? []) as Team[];
  return <main className="page trust-page">
    <Link className="text-link" href="/app">Voltar aos meus rankas</Link>
    <header className="page-heading"><h1 className="display">Equipe</h1><p>Convide quem organiza o futebol com você.</p></header>
    {(erro || error) && <p className="notice notice-warning" role="alert">Não foi possível concluir a operação.</p>}
    {sucesso && <p className="notice" role="status">Acesso removido.</p>}
    {!error && !teams.length && <p>Somente o dono da organização pode gerenciar a equipe.</p>}
    {teams.map((team) => <section className="panel admin-section" key={team.id}>
      <div className="panel-head"><h2 className="panel-title display">{team.name}</h2><span className="badge">{team.members.length + team.invites.length} de {team.limit} vagas</span></div>
      <p className="muted">Convites pendentes reservam uma vaga por sete dias.</p>
      <TeamInviteForm orgId={team.id} full={team.members.length + team.invites.length >= team.limit} />
      {team.members.map((member) => <article className="team-access-row" key={member.id}><span><strong>{member.email}</strong><small>Colaborador ativo</small></span><form action={removeTeamAccess.bind(null, team.id, member.id, false)}><button className="button button-secondary button-small">Remover acesso</button></form></article>)}
      {team.invites.map((invite) => <details className="admin-account-create" key={invite.id}>
        <summary>{invite.email} · Convite pendente</summary>
        <p className="muted">Válido até {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "medium" }).format(new Date(invite.expiresAt))}</p>
        <InviteLink link={new URL(`/convites/equipe/${invite.id}`, siteUrl).href} />
        <form action={removeTeamAccess.bind(null, team.id, invite.id, true)}><button className="button button-secondary button-small">Cancelar convite</button></form>
      </details>)}
    </section>)}
  </main>;
}
