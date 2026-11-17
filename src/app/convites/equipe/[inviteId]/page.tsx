import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { JoinTeamForm } from "./join-form";

export const metadata = { title: "Convite de equipe | Rankaê", robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function TeamInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  if (!hasSupabaseConfig() || !z.uuid().safeParse(inviteId).success) notFound();
  const client = await createClient();
  const [{ data }, { data: open }] = await Promise.all([client.auth.getClaims(), client.rpc("team_invite_open", { p_invite: inviteId })]);
  return <main className="login-page">
    <header className="login-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span></header>
    <section className="login-main">
      <div className="login-copy"><h1 className="display">Entre para a equipe</h1><p>Use este convite para criar sua conta ou entrar com uma conta existente.</p></div>
      {open === true ? <JoinTeamForm inviteId={inviteId} signedIn={Boolean(data?.claims.sub)} /> : <p className="login-card">Este convite já foi usado, expirou ou foi cancelado. Peça um novo link ao organizador.</p>}
    </section>
  </main>;
}
