import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/feedback";
import { TeamRoster } from "@/components/ranka-workspace";
import type { RankaSnapshot } from "@/data/ports/ranka-repository";
import type { RankaSection } from "@/lib/navigation";
import { checkInPlayerAction, createPlayerAction } from "@/app/app/rankas/[rankaId]/actions";

function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><span className="eyebrow">{eyebrow}</span><h1 className="display">{title}</h1><p>{description}</p></header>;
}

function Notice({ success, error }: { success?: string; error?: string }) {
  if (success) return <div className="notice" role="status">Alteração salva com persistência real.</div>;
  if (error) return <div className="notice notice-warning" role="alert">Não foi possível salvar. O estado pode ter mudado; atualize e tente novamente.</div>;
  return null;
}

function Dashboard({ snapshot }: { snapshot: RankaSnapshot }) {
  const present = snapshot.attendance.filter((entry) => entry.status === "present").length;
  return <><Heading eyebrow="Sessão conectada" title={snapshot.name} description={snapshot.sessionLabel} /><div className="metric-grid"><div className="metric"><strong>{present}</strong><span>presentes persistidos</span></div><div className="metric"><strong>{snapshot.players.length}</strong><span>jogadores cadastrados</span></div><div className="metric"><strong>{snapshot.squads.filter((squad) => squad.complete).length}</strong><span>times completos</span></div><div className="metric"><strong>v{snapshot.revision}</strong><span>revisão da sessão</span></div></div><section className="panel" style={{marginTop: 16}}><div className="action-list"><Link className="action-row" href={`/app/rankas/${snapshot.id}/jogadores`}><span><strong>Cadastrar jogadores</strong><small>Nome, apelido e aliases persistentes</small></span><span className="arrow">→</span></Link><Link className="action-row" href={`/app/rankas/${snapshot.id}/chegada`}><span><strong>Registrar chegada</strong><small>Índice atribuído em transação no servidor</small></span><span className="arrow">→</span></Link><Link className="action-row" href={`/app/rankas/${snapshot.id}/times`}><span><strong>Revisar formação</strong><small>Motor puro aplicado ao snapshot autorizado</small></span><span className="arrow">→</span></Link></div></section></>;
}

function Players({ snapshot, success, error }: { snapshot: RankaSnapshot; success?: string; error?: string }) {
  const action = createPlayerAction.bind(null, snapshot.id, snapshot.orgId!);
  return <><Heading eyebrow="Catálogo da organização" title="Jogadores" description="Os dados abaixo vêm do Supabase e só são acessíveis aos membros autorizados." /><Notice success={success} error={error} /><div className="two-column" style={{marginTop: 16}}><section className="panel"><h2 className="panel-title display">Novo jogador</h2><form className="stack" action={action} style={{marginTop: 18}}><div className="field"><label htmlFor="fullName">Nome e sobrenome</label><input className="input" id="fullName" name="fullName" required minLength={2} /></div><div className="field"><label htmlFor="nickname">Apelido</label><input className="input" id="nickname" name="nickname" /></div><div className="field"><label htmlFor="aliases">Outros aliases</label><input className="input" id="aliases" name="aliases" placeholder="Separe por vírgulas" /></div><div className="field"><label htmlFor="role">Preferência</label><select className="select" id="role" name="role" defaultValue="line"><option value="line">Linha</option><option value="keeper">Goleiro</option><option value="either">Qualquer função</option></select></div><button className="button button-primary">Salvar jogador</button></form></section><section className="panel"><div className="panel-head"><h2 className="panel-title display">Perfis autorizados</h2><span className="badge badge-green">{snapshot.players.length}</span></div>{snapshot.players.length ? snapshot.players.map((player) => <div className="person-row" key={player.id}><span className="avatar">{player.fullName.split(" ").slice(0,2).map((part) => part[0]).join("")}</span><span className="person-info"><strong>{player.fullName}</strong><small>{player.aliases.join(" · ") || "Sem alias"}</small></span><span className="badge">{player.role === "keeper" ? "Goleiro" : "Linha"}</span></div>) : <EmptyState title="Nenhum jogador" description="Cadastre o primeiro perfil desta organização." />}</section></div></>;
}

function Arrival({ snapshot, success, error }: { snapshot: RankaSnapshot; success?: string; error?: string }) {
  const presentIds = new Set(snapshot.attendance.map((entry) => entry.playerId));
  const available = snapshot.players.filter((player) => !presentIds.has(player.id));
  const action = checkInPlayerAction.bind(null, snapshot.id, snapshot.sessionId!, snapshot.revision);
  return <><Heading eyebrow="Ordem autoritativa" title="Chegada" description="A fila é numerada dentro de uma transação; relógio do celular não define prioridade." /><Notice success={success} error={error} /><div className="two-column" style={{marginTop: 16}}><section className="panel"><h2 className="panel-title display">Confirmar presença</h2>{available.length ? <form className="cluster" action={action} style={{marginTop: 16}}><label className="sr-only" htmlFor="playerId">Jogador</label><select className="select" id="playerId" name="playerId" required defaultValue="" style={{flex: 1}}><option value="" disabled>Selecione por nome ou apelido</option>{available.map((player) => <option key={player.id} value={player.id}>{player.fullName}{player.aliases[0] ? ` · ${player.aliases[0]}` : ""}</option>)}</select><button className="button button-primary">Adicionar à fila</button></form> : <EmptyState title="Todos já estão na fila" description="Cadastre outro jogador ou revise as presenças." />}</section><section className="panel"><div className="panel-head"><h2 className="panel-title display">Fila presencial</h2><span className="badge badge-green">rev. {snapshot.revision}</span></div>{snapshot.attendance.length ? snapshot.attendance.map((entry) => { const player = snapshot.players.find((item) => item.id === entry.playerId); return <div className="person-row" key={entry.id}><span className="arrival-index">{String(entry.arrivalIndex).padStart(2,"0")}</span><span className="person-info"><strong>{player?.fullName ?? "Perfil indisponível"}</strong><small>{entry.status === "present" ? "Presente" : "Fora da formação"}</small></span></div>; }) : <EmptyState title="Fila vazia" description="Registre a primeira chegada presencial." />}</section></div></>;
}

function Teams({ snapshot }: { snapshot: RankaSnapshot }) {
  return <><Heading eyebrow="Formação calculada" title="Times" description="Os times são derivados das presenças reais; goleiros dedicados ficam fora do pool de linha." />{snapshot.squads.length ? <div className="squad-grid">{snapshot.squads.map((squad, index) => <TeamRoster key={squad.id} squad={squad} players={snapshot.players} side={index === 0 ? "yellow" : index === 1 ? "red" : undefined} />)}</div> : <section className="panel"><EmptyState title="Ainda sem formação" description="Registre chegadas para o motor formar os times." /></section>}</>;
}

function Deferred({ section }: { section: RankaSection }) {
  const labels: Partial<Record<RankaSection, string>> = { partida: "Operação de partida", contribuicoes: "Contribuições", estatisticas: "Estatísticas", configuracoes: "Configurações avançadas" };
  return <><Heading eyebrow="Escopo controlado" title={labels[section] ?? "Em preparação"} description="Esta rota não usa dados fictícios no ambiente conectado." /><section className="panel"><EmptyState title="Base segura pronta" description={section === "estatisticas" ? "Estatísticas reais serão derivadas de eventos íntegros na Fase 3." : "A operação persistente desta área será habilitada na fase prevista do roadmap."} /></section></>;
}

export function RealRankaWorkspace({ active, snapshot, success, error }: { active: RankaSection; snapshot: RankaSnapshot; success?: string; error?: string }) {
  let content: React.ReactNode;
  if (active === "jogadores") content = <Players snapshot={snapshot} success={success} error={error} />;
  else if (active === "chegada") content = <Arrival snapshot={snapshot} success={success} error={error} />;
  else if (active === "times") content = <Teams snapshot={snapshot} />;
  else if (active === "inicio") content = <Dashboard snapshot={snapshot} />;
  else content = <Deferred section={active} />;
  return <AppShell active={active} rankaId={snapshot.id} title={snapshot.name}>{content}</AppShell>;
}
