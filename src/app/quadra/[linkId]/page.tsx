import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { InstallAppButton } from "@/components/install-app-button";
import { CourtOperations, CourtPinForm, type CourtDay } from "./court-forms";

export const metadata = { title: "Acesso à quadra | Rankaê", robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function CourtPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  if (!z.uuid().safeParse(linkId).success) notFound();
  const token = (await cookies()).get("rankae-court-device")?.value;
  const client = await createClient();
  const { data } = token ? await client.rpc("get_court_day", { p_link: linkId, p_device_token: token }) : { data: null };
  const day = data as CourtDay | null;
  return <main className="page court-page">
    <header className="page-heading"><h1 className="display">{day?.name ?? "Acesso à quadra"}</h1></header>
    {day ? <CourtOperations linkId={linkId} day={day} /> : <CourtPinForm linkId={linkId} />}
    <section className="panel court-install"><InstallAppButton /><small>No celular, use o menu do navegador para adicionar o Rankaê à tela de início. Guarde este link para voltar ao jogo.</small></section>
  </main>;
}
