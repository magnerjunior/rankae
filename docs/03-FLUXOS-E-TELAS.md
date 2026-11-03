# Telas, rotas e fluxos

## Rotas sugeridas
- `/` marketing mínimo (fase 3) ou redirecionamento de demonstração na fase 1.
- `/entrar` login organizador.
- `/app` lista de rankas autorizados.
- `/app/rankas/[id]` dashboard do ranka.
- `/app/rankas/[id]/jogadores` catálogo: busca, criação e aliases.
- `/app/rankas/[id]/sessoes/[sessionId]/chegada` ordem presencial, ausentes, ações.
- `/app/rankas/[id]/sessoes/[sessionId]/times` formação, reservas, goleiros e gandulas.
- `/app/rankas/[id]/sessoes/[sessionId]/partida` pré-jogo, ao vivo, resultado e próximo.
- `/app/rankas/[id]/contribuicoes` pagamentos por sessão.
- `/app/rankas/[id]/estatisticas` filtros e placares históricos.
- `/app/rankas/[id]/configuracoes` regras, privacidade, acesso, coorganizadores.
- `/r/[slug]` portal de visualização pública, não listada ou protegida por PIN.
- `/r/[slug]/ao-vivo`, `/r/[slug]/estatisticas`, `/r/[slug]/jogadores` (somente dados públicos permitidos).
- `/admin` superadmin com autenticação reforçada e auditoria (fase 4).

## Fluxo A: chegada presencial
Nova sessão > digitar nome > autocomplete de jogadores existentes (nome completo + apelido para desambiguar) > selecionar > adicionar à fila com `arrival_index` transacional e hora do servidor. Se inexistente: cadastrar nome/sobrenome e apelido opcional; sugerir possíveis duplicatas antes de confirmar. Repetição na mesma sessão retorna aviso e foca entrada existente. Remover/ausente não apaga histórico.

## Fluxo B: preparar partida
Verificar 12 jogadores de linha (default), separar primeiros dois times, escolher distribuição sequencial/aleatória/manual; calcular goleiros e gandulas; exibir camisa/colete amarelo/vermelho e membros; revisar substituições; confirmar início. Quando incompleto, oferecer recomendações explícitas, não alterar silenciosamente.

## Fluxo C: ao vivo
Pré-jogo > Iniciar > Cronômetro e placar. Gol `+` por lado > sheet com jogador do time correspondente (opcional), assistência (opcional), tipo normal/pênalti/gol contra; salvar evento único. `–` abre último(s) evento(s) do lado para desfazer/corrigir; não decrementar sem histórico. Pausar/retomar; adicionar marco; alternar para stats/próximo time e voltar sem perder cronômetro. Alcançada condição de término, abrir revisão/seguir configuração. Se empate, acionar política e prorrogação/desempate. Encerrar > aplicar rotação confirmada > prévia da próxima.

## Fluxo D: sair/substituir
Organizador marca jogador como saiu/temporariamente indisponível, inclusive em equipe em espera. Ao preparar próximo jogo, app detecta vaga e sugere primeiro elegível da fila seguinte. Mostrar quem sobe, origem/destino e motivo; confirmar ou selecionar outro e registrar override. Uma substituição de jogador durante partida deve registrar intervalo e elegibilidade de gol.

## Fluxo E: acesso público
Acessar `/r/[slug]` > público: visualização. Não listado: precisa URL tokenizada não indexável; compartilhável. Protegido: pedir PIN, verificar no servidor, estabelecer sessão temporária de visualização, mostrar apenas projeção pública autorizada. Sem ações de mutação.
