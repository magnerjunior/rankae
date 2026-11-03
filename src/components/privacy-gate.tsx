import Link from "next/link";
import type { PortalGateState } from "@/domain/public-portal/types";

export function PrivacyGate({ slug, gate, linkToken, error }: { slug: string; gate: PortalGateState; linkToken?: string; error?: string }) {
  const needsCompleteLink = gate.linkRequired && !linkToken;
  return <main className="portal-gate">
    <Link className="brand" href="/"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link>
    <section className="portal-gate-card">
      <span className="eyebrow">Visualização protegida</span>
      <h1 className="display">{gate.rankaName ?? "Acesso ao ranka"}</h1>
      {gate.status === "unavailable" || gate.status === "link_required" || needsCompleteLink ? <>
        <p>Este portal não está disponível por este endereço. Use o link completo enviado pelo organizador.</p>
        <div className="notice notice-warning">Links não listados podem ser repassados e não comprovam a identidade de quem acessa.</div>
      </> : <form className="stack" method="post" action={`/r/${slug}/acesso`}>
        <p>Informe o PIN definido pelo organizador.</p>
        <input type="hidden" name="linkToken" value={linkToken} />
        <label className="field">PIN de quatro dígitos<input className="input pin-input mono" name="pin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="one-time-code" required autoFocus /></label>
        {error && <div className="notice notice-warning" role="alert">Não foi possível liberar o acesso. Verifique os dados ou aguarde antes de tentar novamente.</div>}
        <button className="button button-primary">Acessar placar</button>
      </form>}
      <p className="privacy-note">PIN curto e link compartilhado são barreiras leves. Eles não garantem sigilo forte. O portal nunca permite alterar placar ou dados administrativos.</p>
    </section>
  </main>;
}

