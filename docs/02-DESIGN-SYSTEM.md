# Design system — Rankaê

## Direção criativa
Esporte amador brasileiro com linguagem gráfica de campo e placar. Azul elétrico é a cor da marca. A landing usa grandes áreas azuis, grade discreta e diagramas táticos. O painel operacional usa fundo claro, navegação azul e verde neon para ação principal e seleção.

## Tokens
- `--surface: #FFFFFF`, `--brand-100: #EEF3FF`, `--ink: #101A35`.
- `--brand-700: #0739D5`, `--brand-900: #0428A0`, `--brand-accent: #B6FF00`.
- Use texto escuro sobre verde neon. Colete amarelo `#E6B800` com texto escuro e colete vermelho `#AD2935` com texto branco. Inclua sempre o rótulo da equipe.
- Controles com raio de 10–14 px e painéis com raio de 16–20 px. A navegação móvel respeita a área segura.

## Tipografia
- Títulos em **Barlow Condensed 800** com espaçamento compacto. A landing usa uma escala maior e caixa alta no hero.
- Interface em **Barlow** 400, 600 e 700 com arquivos locais do subconjunto latino.
- Placar e cronômetro usam numerais tabulares.

## Superfícies e movimento
- Tabelas e modais usam superfícies sólidas. Botões e barras fixas têm Liquid Glass leve, com fundo sólido como fallback e respeito à preferência por transparência reduzida.
- Elementos táticos são SVG. Vídeos de fundo são reproduzidos quando visíveis, respeitam movimento reduzido e usam `preload="none"`.
- Transições curtas respeitam `prefers-reduced-motion`.

## Componentes obrigatórios
`AppShell`, `BottomNav`, `RankaHeader`, `LiveMatchCard`, `TimerDisplay`, `TeamScorePanel`, `GoalQuickSheet`, `PlayerAutocomplete`, `ArrivalQueue`, `TeamRoster`, `UpcomingTeamPreview`, `KeeperAssignment`, `BallBoyStrip`, `ContributionBulkBar`, `RulesEditor`, `PrivacyGate`, `StatsPeriodSelector`, `EmptyState`, `Toast`, `ConfirmDialog`, `AuditBadge`.

## Composição
- Barra inferior com cinco destinos, centralizada em telas largas. O menu dá acesso às seções secundárias.
- Jogando: amarelo à esquerda, relógio central no topo, vermelho à direita; times têm número/nome visível. Ação + gol explícita em cada lado; desfazer via histórico/`–` com confirmação contextual.
- Tela pré-jogo: equipes e jogadores, goleiros, gandulas, reservas, regra ativa e botão iniciar.
- Filtros rápidos de estatísticas: Último ranka / Este mês / Temporada / Dia específico.
- Evitar modal de 5 etapas para gol; sheet de uma tela com campos opcionais.
- Estados loading, vazio, erro, offline, reconectando, sem time completo e bloqueado.

## Acessibilidade
Contraste WCAG AA como meta, foco visível, teclado, áreas de toque >=44px, rótulos para ícones, alertas sem depender só de cor, feedback de atualização. Verificar em sol/quadra iluminada e celular comum à noite.
