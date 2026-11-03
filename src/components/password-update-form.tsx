"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordUpdateForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("As senhas não são iguais.");
      return;
    }
    setPending(true);
    setMessage(undefined);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setMessage("Não foi possível atualizar a senha. Solicite outro link de recuperação.");
      return;
    }
    router.replace("/entrar?mensagem=senha_atualizada");
    router.refresh();
  }

  return (
    <form className="login-card stack" onSubmit={submit}>
      <span className="badge badge-green">SESSÃO VERIFICADA</span>
      <h2 className="display" style={{fontSize: "2rem", marginBottom: 8}}>Criar nova senha</h2>
      <div className="field"><label htmlFor="new-password">Nova senha</label><input className="input" id="new-password" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="field"><label htmlFor="confirm-password">Repetir nova senha</label><input className="input" id="confirm-password" type="password" minLength={8} autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
      {message && <div className="notice notice-warning" role="alert">{message}</div>}
      <button className="button button-primary" disabled={pending}>{pending ? "Salvando…" : "Atualizar senha"}</button>
    </form>
  );
}
