"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Enrollment { factorId: string; qrCode: string; secret: string; }

export function AdminMfaSetup() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true); setError("");
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Rankaê Superadmin", issuer: "Rankaê" });
    setBusy(false);
    if (enrollError || !data || data.type !== "totp") { setError("Não foi possível iniciar o MFA. Verifique se já existe um fator pendente."); return; }
    setEnrollment({ factorId: data.id, qrCode: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`, secret: data.totp.secret });
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
    setBusy(false);
    if (verifyError) { setError("Código inválido ou expirado. Gere um novo código no autenticador."); return; }
    router.refresh();
  }

  return <section className="panel mfa-panel"><span className="eyebrow">Acesso reforçado</span><h2 className="display">MFA obrigatório para superadmin</h2><p>O painel global nunca abre apenas com senha. Ative um autenticador TOTP; o segredo aparece somente nesta sessão e não é registrado pelo Rankaê.</p>{error && <div className="notice notice-warning">{error}</div>}{!enrollment ? <button className="button button-primary" onClick={begin} disabled={busy}>{busy ? "Preparando…" : "Configurar autenticador"}</button> : <form className="stack" onSubmit={verify}><div className="mfa-enrollment"><Image src={enrollment.qrCode} alt="QR Code para configurar o autenticador" width={220} height={220} unoptimized /><div><strong>Alternativa manual</strong><code>{enrollment.secret}</code><small className="muted">Não compartilhe nem salve em mensagens.</small></div></div><div className="field"><label htmlFor="mfaCode">Código de 6 dígitos</label><input className="input pin-input" id="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></div><button className="button button-primary" disabled={busy}>{busy ? "Verificando…" : "Verificar e elevar sessão"}</button></form>}</section>;
}
