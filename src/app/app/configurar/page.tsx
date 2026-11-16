import { createWorkspaceAction } from "./actions";
import { requireUserId } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccountTrial } from "@/server/account-trial";
import { AccountTrialBanner } from "@/components/account-trial-banner";
import { signOutAction } from "../actions";

export default async function ConfigurePage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const client = await createClient();
  await requireUserId({ client });
  const [trial, entitlement] = await Promise.all([getAccountTrial(client), client.rpc("get_ranka_entitlement")]);
  const teamOnly = !trial && entitlement.data?.limit === 0;
  const { erro } = await searchParams;
  return <main className="login-page">
    <header className="login-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span>{(teamOnly || trial?.ended) && <form action={signOutAction}><button className="button button-secondary button-small">Sair</button></form>}</header>
    <AccountTrialBanner trial={trial} />
    {teamOnly && <section className="page-heading"><h1 className="display">Sem rankas disponíveis</h1><p>Quando a equipe liberar acesso a um ranka, ele aparecerá aqui.</p></section>}
    {!teamOnly && !trial?.ended && <section className="login-main">
      <div className="login-copy"><span className="eyebrow">Primeiro passo</span><h1 className="display">Crie seu<br />ranka.</h1><p>{trial ? "Deixe o grupo pronto agora e inicie o teste no dia em que a turma jogar." : "Você poderá adicionar jogadores e começar assim que salvar."}</p></div>
      <form className="login-card stack" action={createWorkspaceAction}>
        <div className="field"><label htmlFor="organizationName">Nome do seu grupo</label><input className="input" id="organizationName" name="organizationName" required minLength={2} placeholder="Ex.: Galera do bairro" /></div>
        <div className="field"><label htmlFor="rankaName">Nome do ranka</label><input className="input" id="rankaName" name="rankaName" required minLength={2} placeholder="Ex.: Futebol de sábado" /></div>
        <div className="field"><label htmlFor="rankaSlug">Nome curto para o link</label><input className="input" id="rankaSlug" name="rankaSlug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="futebol-sabado" /></div>
        {erro && <div className="notice notice-warning">Não foi possível salvar. Revise os dados ou tente novamente.</div>}
        <button className="button button-primary">Criar meu ranka</button>
      </form>
    </section>}
  </main>;
}
