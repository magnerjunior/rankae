# Decisões consolidadas e premissas

## Confirmado
- Marca: **Rankaê** (grafia com ê), slug técnico ASCII `rankae`.
- Público inicial: organizadores de peladas presenciais; SaaS multi-ranka escalável.
- Tema **claro por padrão** com branco, verde, cinzas controlados; glass de forma seletiva.
- Principal interface durante jogo: cronômetro central, equipes amarela e vermelha, botões `+ gol` e correção, modal rápido de autoria/assistência/penalidade.
- Rotação: equipes numeradas sequencialmente T1, T2, T3...; **cor do colete pertence à vaga de campo**, NÃO à identidade fixa do time.
- Até **3 coorganizadores além do proprietário** em cada ranka; admin plataforma com acesso auditável e mínimo necessário.
- Presença é incluída por organizador ao chegar, via busca/autocomplete de perfis existentes ou novo cadastro. Nome + sobrenome recomendado; apelidos suportados para desambiguação.
- Jogadores não entram com contas próprias e não editam roster.
- Pagamento/contribuição configurable por sessão; marca individual, múltiplos ou todos; default não bloqueia jogo.
- Goleiros 0–4+, alocação configurável; gandulas e goleiros emprestados da espera.
- Partida em andamento continua quando organizador navega a rankings ou próxima partida.
- Público pode acompanhar placar, times atuais, próximo e stats; sessão protegida por acesso opcional.
- Sem fotos de jogadores nas primeiras quatro fases; sem autoimportação WhatsApp ou geo-check.
- Fase 4 inclui políticas legais, monitoramento de desempenho e carga simulada 100/1000 usuários.

## Premissas parametrizadas — validar em campo (não bloquear desenvolvimento)
- Default: **6 jogadores de linha por time**, goleiros em slots separados.
- Default: 10 minutos de tempo normal, prorrogação de 3 minutos quando houver; alternâncias por configuração.
- Default: 4 times ideais / 24 jogadores de linha; sessões podem ter menos ou mais.
- Default: perdedor sai, vencedor permanece. Caso de empate depende de quantidade de equipes completas na espera e configuração.
- Default: contribuição R$ 5,00 apenas como exemplo, campo editável.
- O organizador pode arbitrar substituição fora de prioridade com justificativa e registro.
- A regra especial para goleiros com 1 ou 0 presentes usa jogadores emprestados da próxima equipe: **configurável por ranka** e sem contabilizar como membros permanentes dos times.
- Com 2 goleiros fixos, os dois primeiros da próxima equipe podem atuar como gandulas.
- Com 3 goleiros, goleiro do lado derrotado pode rodar e reserva entra, sem vincular identidade ao colete.
- Com 4 goleiros e 4 times, cada time pode manter seu goleiro; suporte a modalidade de vínculo fixo.

## Itens que exigem testes de validação com organizador
- Com exatamente 1 goleiro, qual time usa fixo e qual joga com emprestado? (Default: primeiro time amarelo usa fixo; outro recebe emprestado; editável.)
- Se não existir próximo time completo, quem atua como gandula? (Default: sugerir jogadores disponíveis, nunca obrigar nem fabricar participantes.)
- Empate com dois times completos esperando: ambos saem já ou após prorrogação? (Configuração por ranka, com default de prorrogação e saída dupla.)
- Quando faltar jogador em equipe de espera, pode recompor todas as equipes? (Default: somente mediante confirmação.)

## Não interpretar literalmente
- `link privado`/`não listado` = difícil de descobrir, **não** prova de identidade e não impede compartilhamento.
- `PIN 4 dígitos` = barreira leve de visualização, não sigilo forte; ver documento de segurança.
- `responder em menos de 1 segundo` = objetivo de SLO medido por percentil e região, não promessa absoluta.
