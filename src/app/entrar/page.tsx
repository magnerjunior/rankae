import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { hasSupabaseConfig, isDemoEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const configured = hasSupabaseConfig();
  const demoEnabled = isDemoEnabled();

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect("/app");
  }

  return (
    <main className="login-page">
      <header className="login-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span></header>
      <section className="login-main">
        <div className="login-copy"><span className="eyebrow">A pelada no ritmo do jogo</span><h1 className="display">Chegou.<br />Jogou.</h1><p>Organize chegada, times e sessões com acesso exclusivo para organizadores.</p></div>
        <div className="login-card">
          <span className={`badge ${configured ? "badge-green" : "badge-red"}`}>{configured ? "AMBIENTE CONECTADO" : "CONFIGURAÇÃO PENDENTE"}</span>
          <h2 className="display" style={{fontSize: "2rem", marginBottom: 8}}>Acesso do organizador</h2>
          {configured ? <LoginForm /> : <div className="notice notice-warning">Adicione a URL e a publishable key do Supabase no arquivo <code>.env.local</code>. Nenhuma chave privada é necessária.</div>}
          {demoEnabled && <Link className="button button-secondary" style={{width: "100%", marginTop: 12}} href="/app/rankas/demo">Abrir demonstração local</Link>}
        </div>
      </section>
      <footer className="login-foot">Rankaê · Acesso protegido por Supabase Auth e RLS</footer>
    </main>
  );
}
