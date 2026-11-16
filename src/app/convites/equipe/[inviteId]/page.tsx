import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { JoinTeamForm } from "./join-form";

export const metadata = { title: "Convite de equipe | Rankaê", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TeamInvitePage({ params, searchParams }: { params: Promise<{ inviteId: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { inviteId } = await params;
  if (!hasSupabaseConfig() || !z.uuid().safeParse(inviteId).success) notFound();
  const client = await createClient();
  const [{ data }, { erro }] = await Promise.all([client.auth.getClaims(), searchParams]);
  return <main className="login-page">
    <header className="login-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span></header>
    <section className="login-main">
      <div className="login-copy"><h1 className="display">Entre para a equipe</h1><p>Confirme o e-mail escolhido pelo organizador para ter acesso aos rankas do grupo.</p>{erro && <p role="alert" className="notice notice-warning">O link de confirmação venceu ou foi aberto em outro navegador. Peça outro e-mail aqui.</p>}</div>
      <JoinTeamForm inviteId={inviteId} signedIn={Boolean(data?.claims.sub)} />
    </section>
  </main>;
}
