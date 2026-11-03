"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const supabase = createClient();
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setPending(false);
    if (result.error) { setMessage("Não foi possível concluir o acesso. Confira os dados e tente novamente."); return; }
    if (mode === "signup" && !result.data.session) { setMessage("Cadastro recebido. Confirme o e-mail antes de entrar."); return; }
    router.push("/app");
    router.refresh();
  }

  return <form className="stack" onSubmit={submit}><div className="field"><label htmlFor="email">E-mail</label><input className="input" id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="field"><label htmlFor="password">Senha</label><input className="input" id="password" type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>{message && <div className="notice notice-warning" role="status">{message}</div>}<button className="button button-primary" disabled={pending} type="submit">{pending ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta de organizador"}</button><button className="button button-quiet" type="button" onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(undefined); }}>{mode === "signin" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}</button></form>;
}
