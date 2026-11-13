"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AccessMode = "signin" | "signup" | "recovery";

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

    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
    setPending(false);
    if (result.error) {
      setMessage(mode === "signup"
        ? "Não foi possível criar a conta. Use um e-mail válido e uma senha com pelo menos 8 caracteres."
        : "Não foi possível entrar. Confira o e-mail e a senha ou recupere seu acesso.");
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("Conta criada. Abra o e-mail de confirmação para liberar o primeiro acesso.");
      return;
    }
    router.push(admin ? "/admin" : "/app");
    router.refresh();
  }

  const buttonLabel = pending
    ? "Aguarde…"
    : mode === "signin"
      ? "Entrar"
      : mode === "signup"
        ? "Criar conta de organizador"
        : "Enviar link de recuperação";

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input className="input" id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      {mode !== "recovery" && <div className="field">
        <label htmlFor="password">Senha</label>
        <input className="input" id="password" type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} />
        {mode === "signup" && <small className="muted">Use pelo menos 8 caracteres.</small>}
      </div>}
      {message && <div className="notice notice-warning" role="status">{message}</div>}
      <button className="button button-primary" disabled={pending} type="submit">{buttonLabel}</button>
      <div className="login-options">
        {mode !== "signin" && <button className="button button-quiet" type="button" onClick={() => { setMode("signin"); setMessage(undefined); }}>Já tenho conta</button>}
        {!admin && mode === "signin" && <button className="button button-quiet" type="button" onClick={() => { setMode("signup"); setMessage(undefined); }}>Primeiro acesso? Criar conta</button>}
        {mode === "signin" && <button className="button button-quiet button-small" type="button" onClick={() => { setMode("recovery"); setMessage(undefined); }}>Esqueci minha senha</button>}
      </div>
    </form>
  );
}
