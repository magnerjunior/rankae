import Image from "next/image";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-document";
import { MarketingVideo } from "@/components/marketing-video";
import { commercialPlanSchema, DEFAULT_COMMERCIAL_PLAN, formatCurrency, trialMessage, whatsappLink } from "@/lib/commercial";
import { createClient } from "@/lib/supabase/server";

async function loadPlan() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_commercial_plan");
    if (error) return DEFAULT_COMMERCIAL_PLAN;
    return commercialPlanSchema.parse(data);
  } catch {
    return DEFAULT_COMMERCIAL_PLAN;
  }
}

export default async function HomePage() {
  const plan = await loadPlan();
  const trialHref = whatsappLink(trialMessage());
  return (
    <main className="marketing-page">
      <header className="marketing-header glass-panel">
        <Link className="brand" href="/" aria-label="Rankaê, início"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link>
        <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#plano">Plano</a></nav>
        <Link className="button button-glass button-small" href="/entrar">Entrar</Link>
      </header>

      <section className="marketing-hero">
        <MarketingVideo />
        <div className="marketing-video-shade" />
        <div className="marketing-hero-content">
          <h1 className="display">Sua pelada<br />no ritmo do jogo</h1>
          <p>Quem chegou, quem joga e quem marcou. Resolva tudo no celular e feche o dia com as estatísticas da turma.</p>
          <div className="marketing-actions"><a className="button marketing-primary" href={trialHref} target="_blank" rel="noreferrer">Testar grátis</a><a className="button marketing-secondary" href="#como-funciona">Ver como funciona</a></div>
          <small>Teste grátis sem cartão de crédito</small>
        </div>
        <div className="marketing-live-card" aria-label="Prévia da operação do Rankaê">
          <div className="marketing-live-head"><span><i /> Jogo 3</span><b>06:42</b></div>
          <div className="marketing-live-score"><div><small>AMARELO · T3</small><strong>2</strong></div><span>×</span><div><small>VERMELHO · T4</small><strong>1</strong></div></div>
          <div className="marketing-live-foot"><span>24 presentes</span><span>Próximo: T5</span></div>
        </div>
      </section>

      <section className="marketing-proof" aria-label="Principais benefícios"><span>Chegada rápida</span><span>Times justos</span><span>Cronômetro confiável</span><span>Estatísticas do dia</span></section>

      <section className="marketing-section marketing-story" id="como-funciona">
        <header className="marketing-section-head"><h2 className="display">Largue o papel<br />e deixe a bola rolar</h2><p>Da chegada da turma ao último jogo, o Rankaê organiza a pelada sem tirar você da beira do campo.</p></header>
        <div className="marketing-steps">
          <article><span>01</span><div><h3>Registre a chegada</h3><p>Digite um nome ou cole a lista inteira. Goleiros ficam separados e a ordem de chegada é preservada.</p></div></article>
          <article><span>02</span><div><h3>Monte e ajuste os times</h3><p>Forme as equipes, troque jogadores e confira a fila antes de colocar o relógio para rodar.</p></div></article>
          <article><span>03</span><div><h3>Conduza o ranka</h3><p>Placar, gols, assistências, cartões, rodízio e contribuições em uma operação rápida pelo celular.</p></div></article>
        </div>
      </section>

      <section className="marketing-section marketing-showcase" id="recursos">
        <div className="marketing-phone" aria-hidden="true"><div className="marketing-phone-bar"><span>Ranka de terça</span><b>3 × 2</b></div><div className="marketing-phone-timer">04:18<small>TEMPO NORMAL</small></div><div className="marketing-phone-teams"><span>AMARELO · T1</span><span>VERMELHO · T2</span></div><div className="marketing-phone-actions"><span>+ GOL</span><span>+ GOL</span></div><div className="marketing-phone-next">Próximo time <b>T3</b></div></div>
        <div className="marketing-showcase-copy"><span className="eyebrow">Feito para a beira da quadra</span><h2 className="display">O jogo todo na palma da mão</h2><p>Mais ritmo na quadra, mais assunto no grupo depois. Cada partida alimenta a história do seu ranka.</p><ul>
          <li><strong>Resposta imediata</strong><span>Toques rápidos e operação preparada para a conexão do campo.</span></li>
          <li><strong>Rodízio organizado</strong><span>Fila de times, próximos jogadores e histórico de partidas.</span></li>
          <li><strong>O dia fica registrado</strong><span>Artilharia, assistências, resultados e contribuições.</span></li>
          <li><strong>Compartilhamento com controle</strong><span>Portal esportivo com privacidade configurável.</span></li>
        </ul></div>
      </section>

      <section className="marketing-section marketing-pricing" id="plano">
        <div className="marketing-price-copy"><span className="eyebrow">Um plano simples</span><h2 className="display">Seu próximo ranka começa aqui</h2><p>Um espaço completo para organizar sua pelada e manter a turma jogando.</p></div>
        <article className="marketing-price-card"><span className="marketing-price-badge">Teste grátis</span><h3>Rankaê Essencial</h3>{plan.compareAtPriceCents && <del>{formatCurrency(plan.compareAtPriceCents)}</del>}<div className="marketing-price"><strong>{formatCurrency(plan.monthlyPriceCents)}</strong><span>/ mês</span></div><p>Inclui 1 ranka ativo na sua conta.</p><ul><li>Fluxo completo do jogo</li><li>Histórico e estatísticas</li><li>Contribuições e portal do grupo</li></ul><div className="marketing-extra"><span>Ranka adicional</span><strong>+ {formatCurrency(plan.extraRankaPriceCents)}/mês</strong></div>{plan.annualPriceCents && <small>Opção anual: {formatCurrency(plan.annualPriceCents)} por ano.</small>}<a className="button marketing-primary" href={trialHref} target="_blank" rel="noreferrer">Testar grátis</a></article>
      </section>

      <section className="marketing-section marketing-final-cta"><Image src="/rankae-icon-transparent.svg" width={64} height={64} alt="" aria-hidden="true" /><h2 className="display">A bola vai rolar<br />Deixe o resto com o Rankaê</h2><a className="button marketing-primary" href={trialHref} target="_blank" rel="noreferrer">Testar grátis</a></section>
      <LegalFooter />
    </main>
  );
}
