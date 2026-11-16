"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { whatsappLink } from "@/lib/commercial";
import { createClient } from "@/lib/supabase/client";

type AccessMode = "signin" | "recovery";

export function LoginForm({ initialMessage, admin = false }: { initialMessage?: string; admin?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AccessMode>("signin");
  const [message, setMessage] = useState<string | undefined>(initialMessage);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const supabase = createClient();

    if (mode === "recovery") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
      });
      setPending(false);
      setMessage(error
        ? "Não foi possível enviar agora. Confira o e-mail e tente novamente."
        : "Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      setMessage("Não foi possível entrar. Confira o e-mail e a senha.");
      return;
    }
    router.push(admin ? "/admin" : "/app");
    router.refresh();
  }

  const buttonLabel = pending
    ? "Aguarde…"
    : mode === "signin"
      ? "Entrar"
      : "Enviar link de recuperação";

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input className="input" id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      {mode !== "recovery" && <div className="field">
        <label htmlFor="password">Senha</label>
        <input className="input" id="password" type="password" minLength={8} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>}
      {message && <div className="notice notice-warning" role="status">{message}</div>}
      <button className="button button-primary" disabled={pending} type="submit">{buttonLabel}</button>
      <div className="login-options">
        {mode !== "signin" && <button className="button button-quiet" type="button" onClick={() => { setMode("signin"); setMessage(undefined); }}>Já tenho conta</button>}
        {!admin && mode === "signin" && <a className="button button-quiet" href={whatsappLink("Olá! Gostaria de solicitar acesso ao Rankaê.")}>Não tenho conta · Entre em contato</a>}
        {mode === "signin" && <button className="button button-quiet button-small" type="button" onClick={() => { setMode("recovery"); setMessage(undefined); }}>Esqueci minha senha</button>}
      </div>
    </form>
  );
}
