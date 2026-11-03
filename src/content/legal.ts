export type LegalDocumentSlug = "termos" | "privacidade" | "cookies" | "direitos";

export interface LegalDraft {
  slug: LegalDocumentSlug;
  key: "terms" | "privacy" | "cookies" | "data_subject_rights";
  title: string;
  version: string;
  summary: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
}

export const legalDrafts: Record<LegalDocumentSlug, LegalDraft> = {
  termos: {
    slug: "termos",
    key: "terms",
    title: "Termos de Uso",
    version: "MINUTA 0.1 · 03/11/2026",
    summary: "Regras propostas para visitantes, proprietários e coorganizadores do Rankaê.",
    sections: [
      { title: "1. Natureza desta minuta", paragraphs: ["Este texto é uma minuta operacional para revisão jurídica brasileira. Não está publicado como contrato definitivo e não deve ser interpretado como garantia de eliminação de riscos legais."] },
      { title: "2. Objeto", paragraphs: ["O Rankaê organiza peladas presenciais, incluindo chegada, formação de times, placar, estatísticas esportivas, contribuição opcional e projeção pública configurável. O serviço não organiza a atividade esportiva nem substitui as decisões e deveres do responsável presencial."] },
      { title: "3. Contas e responsabilidades", paragraphs: ["Somente organizadores autenticados podem alterar dados. O proprietário deve manter sua conta protegida, revisar coorganizadores e encerrar sessões em aparelhos compartilhados.", "O organizador declara possuir fundamento adequado para cadastrar participantes e é responsável pela exatidão, minimização e atualização dos dados inseridos."] },
      { title: "4. Condutas", paragraphs: ["É vedado usar o serviço para fraude, assédio, exposição indevida, violação de direitos, tentativa de acesso a outro ranka ou interferência na disponibilidade da plataforma."] },
      { title: "5. Conteúdo e placar", paragraphs: ["O placar e as estatísticas derivam de eventos registrados pelos organizadores. Correções preservam histórico de auditoria. Informações esportivas podem conter erros de operação e devem ser revisadas pelo responsável da pelada."] },
      { title: "6. Portal compartilhado", paragraphs: ["Links não listados e PIN curto são barreiras leves: podem ser repassados e não comprovam identidade. O organizador deve escolher a visibilidade apropriada e autorizar individualmente os nomes esportivos exibidos."] },
      { title: "7. Disponibilidade e suspensão", paragraphs: ["Metas de desempenho são objetivos operacionais, não garantia absoluta. A plataforma poderá limitar ou suspender acesso em caso de abuso, risco de segurança, manutenção ou obrigação legal, com registro e proporcionalidade."] },
      { title: "8. Responsabilidade e legislação", paragraphs: ["Limitações de responsabilidade, legislação aplicável, foro, suporte e regras de rescisão precisam ser validados por assessoria jurídica antes do lançamento comercial."] },
    ],
  },
  privacidade: {
    slug: "privacidade",
    key: "privacy",
    title: "Política de Privacidade",
    version: "MINUTA 0.1 · 03/11/2026",
    summary: "Proposta de transparência sobre o tratamento de dados no Rankaê.",
    sections: [
      { title: "1. Situação do documento", paragraphs: ["Esta é uma minuta para revisão jurídica e operacional. Antes da publicação comercial, devem ser definidos o controlador, o encarregado ou canal de privacidade, os fornecedores contratados e os prazos finais de retenção."] },
      { title: "2. Dados tratados", paragraphs: ["Podem ser tratados dados de conta do organizador, nome e apelido de participantes, preferências esportivas, presença, escalações, eventos de partida, contribuição presencial e registros técnicos de segurança. Fotos, localização e login de jogador não fazem parte das fases 1 a 4."] },
      { title: "3. Finalidades", paragraphs: ["Os dados são usados para operar a pelada, autenticar organizadores, manter integridade do placar, produzir estatísticas autorizadas, prevenir abuso, prestar suporte, responder a direitos e monitorar confiabilidade."] },
      { title: "4. Bases legais", paragraphs: ["As bases legais aplicáveis devem ser definidas por finalidade após revisão jurídica, podendo envolver execução de contrato, legítimo interesse devidamente avaliado, cumprimento de obrigação e consentimento quando efetivamente necessário. O organizador não deve coletar dados sem fundamento adequado."] },
      { title: "5. Compartilhamento", paragraphs: ["A infraestrutura utiliza fornecedores de hospedagem, banco, autenticação e monitoramento contratados. Supabase e eventual hospedagem web devem ser listados com papéis e transferências internacionais revisados antes da publicação."] },
      { title: "6. Portal e minimização", paragraphs: ["O portal exibe somente projeção esportiva autorizada. Contribuições, e-mails, identificadores de conta, logs administrativos, tokens e hashes não são públicos. Nomes começam ocultos e exigem autorização individual no ranka."] },
      { title: "7. Retenção e segurança", paragraphs: ["Os prazos de retenção devem seguir necessidade, obrigação e defesa de direitos, com descarte seguro. São aplicados isolamento por organização, RLS, auditoria, MFA para superadmin, hashes de segredos e acesso privilegiado justificado."] },
      { title: "8. Direitos dos titulares", paragraphs: ["Titulares podem solicitar confirmação, acesso, correção, anonimização, bloqueio, eliminação, informação e revisão conforme a LGPD. A identidade e a legitimidade do pedido serão verificadas antes da execução."] },
      { title: "9. Incidentes e contato", paragraphs: ["O runbook prevê triagem, contenção, preservação de evidências e avaliação de comunicação. O canal oficial de privacidade ainda precisa ser designado antes do lançamento comercial."] },
    ],
  },
  cookies: {
    slug: "cookies",
    key: "cookies",
    title: "Cookies e armazenamento",
    version: "MINUTA 0.1 · 03/11/2026",
    summary: "Inventário atual de armazenamento e critérios para futuras ferramentas.",
    sections: [
      { title: "1. Uso atual", paragraphs: ["O Rankaê usa cookies e armazenamento estritamente funcionais para sessão autenticada, concessão temporária do portal protegido e funcionamento offline de arquivos estáticos."] },
      { title: "2. Sessão do organizador", paragraphs: ["Cookies de autenticação mantêm a sessão segura e podem ser renovados pelo servidor. Eles são necessários para impedir escrita anônima e isolar organizações."] },
      { title: "3. Portal protegido", paragraphs: ["A concessão temporária é armazenada em cookie httpOnly, SameSite=Lax e, em produção HTTPS, Secure. O token não fica disponível ao JavaScript da página."] },
      { title: "4. PWA e cache", paragraphs: ["O service worker armazena apenas arquivos estáticos e a página offline. Documentos do portal protegido e páginas administrativas usam no-store e não entram no cache compartilhado."] },
      { title: "5. Analytics futuros", paragraphs: ["Ferramentas não essenciais de analytics, publicidade ou replay de sessão não estão autorizadas nesta fase. Qualquer adoção futura exige inventário, avaliação jurídica, transparência e mecanismo de escolha quando aplicável."] },
    ],
  },
  direitos: {
    slug: "direitos",
    key: "data_subject_rights",
    title: "Correção, exclusão e direitos",
    version: "MINUTA OPERACIONAL 0.1 · 03/11/2026",
    summary: "Como registrar, verificar e atender solicitações relacionadas a dados pessoais.",
    sections: [
      { title: "1. Como solicitar", paragraphs: ["Participantes sem conta podem procurar o organizador responsável pelo ranka. Organizadores autenticados registram a solicitação na área Privacidade, vinculando-a à organização e, quando necessário, ao perfil correto."] },
      { title: "2. Verificação", paragraphs: ["Antes de fornecer, alterar ou excluir dados, o responsável verifica identidade, legitimidade e escopo com o mínimo de informação adicional. Não se deve responder com dados pessoais por canais inseguros."] },
      { title: "3. Tratamento", paragraphs: ["Pedidos podem envolver acesso, correção, retirada de nome público ou exclusão. A retirada pública deve ser priorizada; exclusão pode resultar em anonimização quando a retenção de eventos íntegros ou obrigações impedir o apagamento imediato."] },
      { title: "4. Registro e resposta", paragraphs: ["O sistema registra protocolo, estado, datas e uma nota de resolução, sem anexar documentos sensíveis desnecessários. Prazos e modelo de resposta devem ser confirmados por assessoria jurídica."] },
      { title: "5. Escalonamento", paragraphs: ["Suspeita de incidente, conflito de identidade, pedido de autoridade ou grande volume deve ser escalonado ao responsável designado, seguindo o runbook e preservando evidências."] },
    ],
  },
};

export function isLegalDocumentSlug(value: string): value is LegalDocumentSlug {
  return value in legalDrafts;
}
