export function TacticalPitch() {
  return (
    <svg className="tactical-pitch" viewBox="0 0 480 390" fill="none" aria-hidden="true">
      <g className="pitch-lines" stroke="currentColor" strokeWidth="1.5">
        <rect x="35" y="34" width="410" height="322" rx="10" />
        <path d="M240 34v322M35 109h74v172H35m410-172h-74v172h74M35 152h30v86H35m410-86h-30v86h30" />
        <circle cx="240" cy="195" r="57" />
        <path d="M35 52a18 18 0 0 0 18-18m374 0a18 18 0 0 0 18 18m0 286a18 18 0 0 0-18 18m-374 0a18 18 0 0 0-18-18" />
      </g>
      <g className="pitch-play" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M101 291q62-87 147-59t128-113" strokeDasharray="6 8" />
        <path d="m358 131 18-12 8 20M94 93l20 20m0-20-20 20m274 185 20 20m0-20-20 20" />
        <circle cx="101" cy="291" r="8" fill="currentColor" />
        <circle cx="410" cy="66" r="20" />
        <path d="m410 58 8 6-3 10h-10l-3-10 8-6Zm0 0v-12m8 18 11-4m-14 14 7 8m-17-8-7 8m4-18-11-4" />
      </g>
    </svg>
  );
}

export function MatchPreview() {
  return (
    <figure className="match-preview" aria-label="Demonstração da tela de partida">
      <div className="match-preview-header">
        <span className="brand-mark" aria-hidden="true" />
        <div><strong>Ranka de terça</strong><small>Partida 3</small></div>
        <span className="match-preview-live">Ao vivo</span>
      </div>
      <div className="scoreboard">
        <div className="timer-bar"><div className="timer">04:18</div><small>Tempo normal</small></div>
        <div className="score-sides">
          <div className="score-side"><span className="side-label side-yellow">Amarelo · T3</span><strong className="score-number">2</strong><span className="goal-button goal-yellow">+ GOL</span></div>
          <div className="score-side"><span className="side-label side-red">Vermelho · T4</span><strong className="score-number">1</strong><span className="goal-button goal-red">+ GOL</span></div>
        </div>
      </div>
      <figcaption><span>Exemplo de partida</span><strong>Próximo · T5</strong></figcaption>
    </figure>
  );
}
