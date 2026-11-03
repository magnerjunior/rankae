# Design system — Rankaê (obrigatório)

## Direção criativa
Esporte amador premium, brasileiro, identidade marcante e interface focada. **Tema claro default**, não estética de dashboard de IA. Branco principal, verde premium como assinatura, cinzas sólidos. Visual técnico/esportivo sofisticado, modular e mais editorial que brinquedo. Evitar cards flutuando sem propósito, gradientes neon, sombras pesadas e ícones decorativos em cada linha.

## Tokens iniciais — ajustar por contraste
- `--bg: #F8FAF8` (canvas), `--surface: #FFFFFF`, `--surface-alt: #F1F5F1`.
- `--brand-900: #0B3D2E`, `--brand-700: #126B49`, `--brand-600: #167A52`, `--brand-100: #E4F3E9`.
- `--ink: #14251D`, `--muted: #64736A`, `--border: #DAE5DC`, `--danger: #C83B42`.
- Colete amarelo `#E6B800` com texto muito escuro; colete vermelho `#C93F43` com texto branco; ambos com rótulos textuais — não depender só de cor.
- Border radius: 10–14px controles, 16–20px painéis, modal 20px; não arredondar tudo como pílula.
- Espaçamento base 4/8/12/16/24/32 px; layout 8pt grid; largura confortável <=1200px; mobile bottom nav fixa com safe-area.

## Tipografia
- Títulos: fonte de impacto com letras relativamente abertas: testar **Barlow Condensed** peso 700/800 com tracking +0.02em a +0.045em; ou **Teko** se boa leitura. NÃO usar Bebas Neue como única fonte nem títulos apertados.
- Texto/interface: **Barlow** (500/600 para rótulos, 400 para corpo) ou **Manrope**; escolher uma e manter consistência.
- Números do placar e cronômetro: numerais tabulares, bem grandes e estáveis.
- Fallbacks locais e `font-display: swap`; validar caracteres `ê`, `ç`, `ã` e acentos.
- Evitar fontes de peso 300, texto cinza muito pálido e caixa alta no corpo.

## Vidro / glass
O usuário citou “Expo Glasser Effect”; interpretado como referência visual a **Expo GlassEffect / Liquid Glass**, não exigência técnica da biblioteca Expo. Produto é **Next.js web/PWA**; não instalar `expo-glass-effect` (componente nativo iOS).
- Usar `backdrop-filter: blur(14px)` com fundo translúcido e borda sutil **somente** em navbar inferior, barra rápida, modais/overlays e talvez cabeçalho sticky.
- `@supports` e fallback opaco para navegadores incompatíveis; respeitar `prefers-reduced-transparency` e `prefers-reduced-motion` quando aplicável.
- Vidro nunca pode reduzir contraste, legibilidade de placar nem interferir em performance de celular básico.
- Preferir elementos sólidos em linhas/tabelas e nas ações críticas durante jogo.

## Componentes obrigatórios
`AppShell`, `BottomNav`, `RankaHeader`, `LiveMatchCard`, `TimerDisplay`, `TeamScorePanel`, `GoalQuickSheet`, `PlayerAutocomplete`, `ArrivalQueue`, `TeamRoster`, `UpcomingTeamPreview`, `KeeperAssignment`, `BallBoyStrip`, `ContributionBulkBar`, `RulesEditor`, `PrivacyGate`, `StatsPeriodSelector`, `EmptyState`, `Toast`, `ConfirmDialog`, `AuditBadge`.

## Composição
- Desktop: sidebar compacta + área principal; mobile: topo enxuto + bottom nav com 4–5 destinos e FAB contextual se necessário.
- Jogando: amarelo à esquerda, relógio central no topo, vermelho à direita; times têm número/nome visível. Ação + gol explícita em cada lado; desfazer via histórico/`–` com confirmação contextual.
- Tela pré-jogo: equipes e jogadores, goleiros, gandulas, reservas, regra ativa e botão iniciar.
- Filtros rápidos de estatísticas: Último ranka / Este mês / Temporada / Dia específico.
- Evitar modal de 5 etapas para gol; sheet de uma tela com campos opcionais.
- Estados loading, vazio, erro, offline, reconectando, sem time completo e bloqueado.

## Acessibilidade
Contraste WCAG AA como meta, foco visível, teclado, áreas de toque >=44px, rótulos para ícones, alertas sem depender só de cor, feedback de atualização. Verificar em sol/quadra iluminada e celular comum à noite.
