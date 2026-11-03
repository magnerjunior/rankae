import { notFound, redirect } from "next/navigation";
import { RankaWorkspace } from "@/components/ranka-workspace";
import { RealRankaWorkspace } from "@/components/real-ranka-workspace";
import { SupabaseRankaRepository } from "@/data/supabase/supabase-ranka-repository";
import { isRankaSection } from "@/lib/navigation";
import { isDemoEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

export default async function RankaPage({ params, searchParams }: { params: Promise<{ rankaId: string; section?: string[] }>; searchParams: Promise<{ sucesso?: string; erro?: string }> }) {
  const { rankaId, section } = await params;
  const active = section?.[0] ?? "inicio";
  if (!isRankaSection(active)) notFound();
  if (rankaId === "demo") {
    if (!isDemoEnabled()) redirect("/entrar");
    return <RankaWorkspace initialSection={active} />;
  }
  await requireUserId();
  const repository = new SupabaseRankaRepository(await createClient());
  const snapshot = await repository.getSnapshot(rankaId).catch(() => null);
  if (!snapshot) notFound();
  const { sucesso, erro } = await searchParams;
  return <RealRankaWorkspace active={active} snapshot={snapshot} success={sucesso} error={erro} />;
}
