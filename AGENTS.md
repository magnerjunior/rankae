# Instruções permanentes do repositório — Codex

Você implementa **Rankaê**, SaaS para peladas brasileiras. Leia `README.md` e `docs/00-ESCOPO-E-DECISOES.md`; leia apenas os documentos relevantes à fase. **Não tente implementar todo o roadmap em uma execução.**

## Contrato de execução
1. Identifique a fase autorizada pelo usuário. Se nenhuma, realize apenas a fase 1.
2. Faça plano de arquivos, riscos e dependências; implemente em lotes pequenos.
3. Não adicione features futuras, dados reais falsos, mock não identificado ou bibliotecas não justificadas.
4. Preserve arquitetura limpa: UI/components, aplicação/use-cases, domínio/regras puras, infraestrutura/repositórios.
5. Tudo mobile-first, tema claro premium, acessível, rápido. Seguir `docs/02-DESIGN-SYSTEM.md`.
6. Regras de fila, goleiros, times e rodízio são **funções puras testadas** antes de integrar à UI.
7. Nunca confie em permissão no cliente: validar no servidor, RLS e transações para escrita.
8. Para operações críticas enviar idempotency key e versionamento otimista, evitar gravações conflitantes.
9. Cronômetro baseado em horário autoritativo + durações acumuladas, não em setInterval como fonte de verdade.
10. Stats derivadas de eventos íntegros; desfazer gol deve cancelar/corrigir evento, não decrementar contador sem lastro.
11. Respeite isolamento multi-tenant e privacidade; todo dado público passa por projeção segura.
12. A fase 1 deve funcionar localmente com adaptador **demo** explicitamente rotulado; fase 1.5 substitui por persistência real. Não chamar demo de produção.
13. Para textos legais, gerar **minutas para revisão jurídica**, jamais prometer imunidade a processo.
14. Não criar login para jogadores, autoconfirmação no WhatsApp, chatbot, fotos ou localização nas fases 1–4.
15. Não exponha credenciais, tokens, informações pessoais, logs completos com dados de usuário ou chaves de admin.
16. Evite mudanças não solicitadas; documente decisões em `docs/DECISION-LOG.md`.

## Ao terminar cada fase
- Listar implementado vs pendente, arquivos alterados, migrações, testes executados e resultados reais, riscos conhecidos.
- Executar `lint`, `typecheck`, testes unitários e smoke tests compatíveis; não afirmar sucesso sem execução.
- Registrar como reproduzir e fazer demonstração manual.
- **Parar e pedir autorização explícita:** só avançar ao receber `OK FASE X`.

## Não fazer
- Não modificar produção sem aprovação.
- Não instalar integrações não autorizadas.
- Não escrever políticas permissivas RLS (`USING (true)`) em tabelas privadas.
- Não usar senha de 4 dígitos como único mecanismo de autenticação administrativa.
- Não usar cache global que misture dados privados de diferentes rankas.
- Não adotar componentes genéricos de dashboard com degradês exagerados, ícones em todos os itens ou visual escuro.
