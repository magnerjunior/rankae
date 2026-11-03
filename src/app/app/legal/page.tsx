import Link from "next/link";
import { acceptLegalDocumentAction } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";
import { TrustRepository } from "@/data/supabase/trust-repository";

export default async function LegalAcceptancePage({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  await requireUserId({ allowPendingLegal: true });
  const query = await searchParams;
  const repository = new TrustRepository(await createClient());
  let documents = [] as Awaited<ReturnType<typeof repository.pendingLegalDocuments>>;
  let unavailable = false;
  try { documents = await repository.pendingLegalDocuments(); } catch { unavailable = true; }
  return <main className="page trust-page"><header className="between"><Link className="brand" href="/app"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><Link className="button button-secondary button-small" href="/app">Voltar</Link></header><header className="page-heading"><span className="eyebrow">Documentos e aceites</span><h1 className="display">Transparência antes do aceite.</h1><p>Somente versões publicadas após revisão jurídica podem exigir aceite. As minutas públicas não geram aceite contratual.</p></header>{query.erro && <div className="notice notice-warning">O aceite não foi registrado. Recarregue e confirme a versão apresentada.</div>}{query.sucesso && <div className="notice">Aceite registrado com data, versão e usuário autenticado.</div>}{unavailable ? <div className="panel empty"><strong>Módulo legal ainda não aplicado</strong><span>A migração da Fase 4 precisa ser aplicada antes de registrar aceites.</span></div> : documents.length === 0 ? <div className="panel empty"><strong>Nenhum aceite pendente</strong><span>As minutas continuam disponíveis para consulta e revisão.</span><Link className="button button-secondary" href="/legal/privacidade">Consultar minutas</Link></div> : <div className="stack">{documents.map((document) => <article className="panel legal-acceptance" key={document.id}><span className="badge badge-green">VERSÃO {document.version}</span><h2>{document.title}</h2><p className="legal-body-preview">{document.body}</p><form action={acceptLegalDocumentAction}><input type="hidden" name="documentId" value={document.id} /><input type="hidden" name="version" value={document.version} /><label className="check-row"><input type="checkbox" required name="confirmed" />Li esta versão e concordo com o documento publicado.</label><button className="button button-primary">Registrar aceite</button></form></article>)}</div>}</main>;
}
