import Link from "next/link";
import type { Metadata } from "next";
import { LegalFooter } from "@/components/legal-document";
import { MatchPreview, TacticalPitch } from "@/components/match-preview";
import { FriendsVideo, MarketingVideo } from "@/components/marketing-video";
import { MarketingFeatureRail } from "@/components/marketing-feature-rail";
import { commercialPlanSchema, DEFAULT_COMMERCIAL_PLAN, formatCurrency, trialMessage, whatsappLink } from "@/lib/commercial";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import "./marketing.css";

export const metadata: Metadata = {
  title: "Rankaê | App para organizar peladas e futebol amador",
  description: "Organize sua pelada pelo celular. Controle presença, monte times, registre gols e acompanhe rankings, contribuições e resultados do futebol da sua turma.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Rankaê | App para organizar peladas e futebol amador",
    description: "Presença, times, placar e rankings da sua pelada em um só app.",
    url: "/",
    siteName: "Rankaê",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/rankae-brand-social.png", alt: "Rankaê" }],
  },
};

const features = [
  { title: "Chegada e presença", description: "Registre quem chegou primeiro, cole a lista da turma e separe os goleiros." },
  { title: "Times sem panelinha", description: "Monte os times pela ordem de chegada e acerte as trocas antes da bola rolar." },
  { title: "Cronômetro e placar", description: "Inicie, pause e retome o relógio. Anote gols, assistências e cartões pelo celular." },
  { title: "Fila e rodízio", description: "Veja quem joga a próxima, acompanhe os reservas e rode os times a cada partida." },
  { title: "Pagamentos em dia", description: "Marque as contribuições pagas e confira o que falta receber sem depender de planilha." },
  { title: "Ranking e resultados", description: "Veja gols, assistências, jogos, vitórias e derrotas. Consulte os detalhes de cada partida." },
  { title: "Agenda e regras da turma", description: "Defina os dias da pelada, o tamanho dos times, o tempo de jogo e como resolver empates." },
  { title: "Portal para a turma", description: "Compartilhe os resultados e as estatísticas por link e escolha quem pode acessar." },
];

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
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Rankaê",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web",
    url: siteUrl.href,
    inLanguage: "pt-BR",
    offers: { "@type": "Offer", price: plan.monthlyPriceCents / 100, priceCurrency: "BRL", url: new URL("/#plano", siteUrl).href },
  };
  return (
    <main className="marketing-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <header className="marketing-header">
        <Link className="brand" href="/" aria-label="Rankaê, início"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link>
        <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#plano">Plano</a></nav>
        <Link className="button marketing-login" href="/entrar">Entrar</Link>
      </header>

      <section className="marketing-hero">
        <MarketingVideo />
        <div className="marketing-hero-layout">
          <div className="marketing-hero-content">
            <h1 className="display">Seu futebol <em>no ritmo do jogo</em></h1>
            <p>Organize a pelada da sua turma pelo celular. Anote quem chegou, monte os times e registre os gols sem perder o ritmo do jogo.</p>
            <div className="marketing-actions"><a className="button marketing-primary" href={trialHref} target="_blank" rel="noreferrer">Testar grátis</a><a className="button marketing-secondary" href="#como-funciona">Ver como funciona</a></div>
            <small>Teste grátis sem cartão de crédito</small>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-story" id="como-funciona">
        <FriendsVideo />
        <header className="marketing-section-head"><h2 className="display">Largue o papel<br />e deixe a bola rolar</h2><p>Da chegada da turma ao último jogo, o Rankaê organiza o futebol sem tirar você da beira do campo.</p></header>
        <div className="marketing-steps">
          <article><span>01</span><div><h3>Registre a chegada</h3><p>Digite um nome ou cole a lista inteira. Goleiros ficam separados e a ordem de chegada é preservada.</p></div></article>
          <article><span>02</span><div><h3>Monte e ajuste os times</h3><p>Forme as equipes, troque jogadores e confira a fila antes de colocar o relógio para rodar.</p></div></article>
          <article><span>03</span><div><h3>Conduza o ranka</h3><p>Placar, gols, assistências, cartões, rodízio e contribuições em uma operação rápida pelo celular.</p></div></article>
        </div>
      </section>

      <section className="marketing-section marketing-showcase">
        <div className="marketing-showcase-copy"><span className="eyebrow">Feito para a beira da quadra</span><h2 className="display">O jogo todo na palma da mão</h2><p>Mais ritmo na quadra, mais assunto no grupo depois. Cada partida alimenta a história do seu ranka.</p></div>
        <div className="marketing-hero-visual marketing-feature-art"><TacticalPitch /><MatchPreview /></div>
      </section>

      <section className="marketing-section marketing-features" id="recursos" aria-labelledby="marketing-features-title">
        <h2 className="display" id="marketing-features-title">Tudo para organizar sua pelada</h2>
        <MarketingFeatureRail features={features} />
      </section>

      <section className="marketing-section marketing-pricing" id="plano">
        <div className="marketing-price-copy"><span className="eyebrow">Um plano simples</span><h2 className="display">Seu próximo ranka começa aqui</h2><p>Um espaço completo para organizar seu futebol e manter a turma jogando.</p></div>
        <article className="marketing-price-card"><span className="marketing-price-badge">Teste grátis</span><h3>Rankaê Essencial</h3>{plan.compareAtPriceCents && <del>{formatCurrency(plan.compareAtPriceCents)}</del>}<div className="marketing-price"><strong>{formatCurrency(plan.monthlyPriceCents)}</strong><span>/ mês</span></div><p>Inclui 1 ranka ativo na sua conta.</p><ul><li>Fluxo completo do jogo</li><li>Histórico e estatísticas</li><li>Contribuições e portal do grupo</li></ul><div className="marketing-extra"><span>Ranka adicional</span><strong>+ {formatCurrency(plan.extraRankaPriceCents)}/mês</strong></div>{plan.annualPriceCents && <small>Opção anual: {formatCurrency(plan.annualPriceCents)} por ano.</small>}<a className="button marketing-primary" href={trialHref} target="_blank" rel="noreferrer">Testar grátis</a></article>
      </section>

      <section className="marketing-section marketing-final-cta"><h2 className="display">A bola vai rolar<br />Deixe o resto com o Rankaê</h2><a className="button marketing-primary" href={trialHref} target="_blank" rel="noreferrer">Testar grátis</a></section>
      <LegalFooter />
    </main>
  );
}
