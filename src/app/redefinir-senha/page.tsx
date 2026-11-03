import { PasswordUpdateForm } from "@/components/password-update-form";
import { requireUserId } from "@/server/auth";

export default async function ResetPasswordPage() {
  await requireUserId({ allowPendingLegal: true });
  return (
    <main className="login-page">
      <header className="login-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span></header>
      <section className="login-main">
        <div className="login-copy"><span className="eyebrow">Recuperação de acesso</span><h1 className="display">Volte<br />pro jogo.</h1><p>Escolha uma nova senha para continuar administrando seus rankas.</p></div>
        <PasswordUpdateForm />
      </section>
    </main>
  );
}
