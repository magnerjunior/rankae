# Visibilidade, link não listado, PIN e controles

## Modos
- `public`: portal indexável opcional, visualização livre dos campos autorizados.
- `unlisted`: URL com token longo, aleatório e não adivinhável + `noindex` + `Referrer-Policy: no-referrer`; acesso de quem possui link, **qualquer pessoa pode repassá-lo**.
- `pin_protected`: exige 4 dígitos (opção desejada pelo usuário) + token de link não listado quando definido; acesso só após verificação server-side e concessão temporária de visualização.
- `private_off`: desabilita portal.

## PIN 4 dígitos — aviso obrigatório
10.000 combinações são poucas: não oferecer como sigilo robusto. Exigir rate limiting por IP+recurso+identificador, atrasos progressivos, bloqueio temporário, monitoramento de abuso, mensagens genéricas, sessões temporárias httpOnly Secure SameSite e rotação do PIN. Armazenar PIN com hash adequado e proteção adicional server-side, nunca em texto claro, frontend ou URL. Para rankas sensíveis oferecer PIN mais longo e/ou convite individual no futuro.

## Público acessa
Nome/apelido esportivo autorizado, número do time, escalação vigente, colete amarelo/vermelho, cronômetro, placar, próximo time, gandulas (se autorizado), resultados e estatísticas agregadas por período. **Não** acessa contribuição, telefone, e-mail, log de admin, dados de identidade, perfil indisponível/oculto, chave de acesso nem informações internas.

## Gestão de consentimento / dados
Organizador responde pelo cadastro adequado; app dispõe de política de privacidade, mecanismo de remoção/correção de perfil e configuração de visibilidade. Fotos serão futuras com autorização específica. Para público jovem, privilegiar restrição e minimização de dados; evitar localizar pessoas em tempo real. Expor ao vivo só o mínimo esportivo.

## Acesso do mesário
Somente contas organizadoras autenticadas têm escrita. Celular compartilhado: oferecer bloqueio rápido de ações e revalidação de sessão/credencial para operações sensíveis; não confundir PIN do portal com credencial de admin. Deslogar em aparelho emprestado; não permitir que visitante usando celular desbloqueado altere tudo sem confirmação.
