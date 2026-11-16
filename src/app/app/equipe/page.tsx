import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";
import { TeamPanel, type Team } from "./team-panel";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ equipe_erro?: string; equipe_sucesso?: string }> }) {
  const client = await createClient();
  await requireUserId({ client });
  const [{ data, error }, { equipe_erro, equipe_sucesso }] = await Promise.all([client.rpc("get_owned_teams"), searchParams]);
  const teams = (data ?? []) as Team[];
  return <main className="page trust-page">
    <Link className="text-link" href="/app">Voltar aos meus rankas</Link>
    <header className="page-heading"><h1 className="display">Equipe</h1><p>Convide quem organiza o futebol com você.</p></header>
    {(equipe_erro || error) && <p className="notice notice-warning" role="alert">Não foi possível concluir a operação.</p>}
    {equipe_sucesso && <p className="notice" role="status">Acesso removido.</p>}
    {!error && !teams.length && <p>Somente o dono da organização pode gerenciar a equipe.</p>}
    {teams.map((team) => <TeamPanel key={team.id} team={team} />)}
  </main>;
}
