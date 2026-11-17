import { adminAuthConfigured } from "@/lib/supabase/admin-auth";
import { siteUrl } from "@/lib/site-url";
import { InviteLink } from "@/components/invite-link";
import { removeTeamAccess } from "./actions";
import { TeamInviteForm } from "./invite-form";

export type Team = { id: string; name: string; limit: number; members: { id: string; email: string }[]; invites: { id: string; email: string | null; expiresAt: string }[] };

export function TeamPanel({ team, rankaId }: { team: Team; rankaId?: string }) {
  return <section className="panel admin-section">
      <div className="panel-head"><h2 className="panel-title display">{rankaId ? "Equipe e colaboradores" : team.name}</h2><span className="badge">{team.members.length + team.invites.length} de {team.limit} vagas</span></div>
      <p className="muted">O link reserva uma vaga por sete dias e deixa de funcionar quando alguém entra na equipe.</p>
      {!adminAuthConfigured() && <p className="muted">O cadastro de contas novas requer a chave de provisionamento no servidor. Quem já tem conta pode aceitar o convite.</p>}
      <TeamInviteForm orgId={team.id} rankaId={rankaId} full={team.members.length + team.invites.length >= team.limit} />
      {team.members.map((member) => <article className="team-access-row" key={member.id}><span><strong>{member.email}</strong><small>Colaborador ativo</small></span><form action={removeTeamAccess.bind(null, team.id, member.id, false, rankaId)}><button className="button button-secondary button-small">Remover acesso</button></form></article>)}
      {team.invites.map((invite) => <details className="admin-account-create" key={invite.id}>
        <summary>{invite.email ?? "Link de uso único"} · Convite pendente</summary>
        <p className="muted">Válido até {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "medium" }).format(new Date(invite.expiresAt))}</p>
        <InviteLink link={new URL(`/convites/equipe/${invite.id}`, siteUrl).href} />
        <form action={removeTeamAccess.bind(null, team.id, invite.id, true, rankaId)}><button className="button button-secondary button-small">Cancelar convite</button></form>
      </details>)}
    </section>;
}
