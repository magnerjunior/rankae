# PROMPT — FASE 1.5: infraestrutura real

Recebi autorização `OK FASE 1.5`. Leia `AGENTS.md`, `docs/07-ARQUITETURA.md`, `docs/08-DADOS-E-RLS.md`, `docs/09-ACESSO-E-PRIVACIDADE.md`, `docs/12-ROADMAP.md`. Inspecione projeto e diferenças desde a fase 1.

Conecte GitHub e Supabase **apenas mediante permissões/URLs fornecidas e integração disponível**. Não peça que eu cole senhas, service_role ou tokens privados no chat; utilize secrets e variáveis de ambiente seguras. Crie SQL migrations, constraints, políticas RLS, testes de tenant isolation, Supabase Auth para organizadores, até 3 coorganizadores além do proprietário, e persistência de rankas/jogadores/sessões/attendance. Configure deploy staging na Vercel se eu autorizar e houver acesso, sem presumir existência. Remova mocks das rotas reais, deixando demo apenas dev opt-in.

Valide fluxos, migrações, env example, lint/typecheck/testes. Entregue relatório claro de configurações que fiz e de ações que precisam ser concluídas pelo usuário. **PARE**, aguarde `OK FASE 2`.
