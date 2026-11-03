# PROMPT — FASE 2: operação presencial completa

Autorizado `OK FASE 2`. Leia `AGENTS.md`, `docs/04-REGRAS-RANKA.md`, `docs/05-PARTIDAS-E-ESTATISTICAS.md`, `docs/06-CONTRIBUICOES.md`, `docs/15-CONTRATOS-E-ESTADOS.md`, `quality/CENARIOS-TESTE.md` e progresso.

Implemente fluxo real: check-in presencial com autocomplete/deduplicação/aliases, sequência estável, 6 jogadores de linha por squad configuráveis, goleiros 0/1/2/3/4, gandulas sugeridos, esperas/T5+, substituição com confirmação e override, atribuição dinâmica colete amarelo/vermelho sem renomear squad, rotação após partida, contribuição com seleção em lote. Pré-jogo e partida: relógio server-authoritative, iniciar/pausar/retomar/reset auditável, eventos de gol com autor/assistência opcionais e normal/pênalti/gol contra, correção via evento, pênalti defendido/perdido, marcos, configurações de tempo/gols/diferença, prorrogação 3min configurável, pênaltis/ímpar ou par/ambos saem conforme espera. Manter partida ativa ao navegar, permitir dois mesários sem duplicar evento. Usar transações/idempotência/revisions e realtime autorizado.

Implementar testes reais dos cenários. Entrega deve permitir jogar uma sessão inteira sem papel. Não fazer portal público completo nem automações futuras. Documente resultados e **PARE** esperando `OK FASE 3`.
