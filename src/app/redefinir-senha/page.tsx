import { PasswordUpdateForm } from "@/components/password-update-form";
import { requireUserId } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { redirect } from "next/navigation";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ convite?: string }> }) {
  if (!hasSupabaseConfig()) redirect("/entrar");
  const client = await createClient();
  await requireUserId({ client, allowPendingLegal: true });
  const { data } = await client.auth.getClaims();
  const email = typeof data?.claims.email === "string" ? data.claims.email : undefined;
  const invited = (await searchParams).convite === "1";
  return (
    <main className="login-page">
      <header className="login-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span></header>
      <section className="login-main">
        <div className="login-copy"><span className="eyebrow">Recuperação de acesso</span><h1 className="display">Volte<br />pro jogo.</h1><p>Escolha uma nova senha para continuar administrando seus rankas.</p></div>
        <PasswordUpdateForm email={email} invited={invited} />
      </section>
    </main>
  );
}
