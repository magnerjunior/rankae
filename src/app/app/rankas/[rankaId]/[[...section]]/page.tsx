import { notFound, redirect } from "next/navigation";
import { RankaWorkspace } from "@/components/ranka-workspace";
import { RealRankaWorkspace } from "@/components/real-ranka-workspace";
import { RankaNotFoundError, SupabaseRankaRepository } from "@/data/supabase/supabase-ranka-repository";
import { PublicPortalRepository } from "@/data/supabase/public-portal-repository";
import { parsePortalPeriod } from "@/domain/public-portal/rules";
import { isRankaSection } from "@/lib/navigation";
import { isDemoEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

export default async function RankaPage({ params, searchParams }: { params: Promise<{ rankaId: string; section?: string[] }>; searchParams: Promise<{ sucesso?: string; erro?: string; period?: string; date?: string; etapa?: string }> }) {
  const { rankaId, section } = await params;
  const active = section?.[0] ?? "inicio";
  if (!isRankaSection(active)) notFound();
  if (rankaId === "demo") {
    if (!isDemoEnabled()) redirect("/entrar");
    return <RankaWorkspace initialSection={active} />;
  }
  await requireUserId();
  const client = await createClient();
  const repository = new SupabaseRankaRepository(client);
  const snapshot = await repository.getSnapshot(rankaId).catch((error: unknown) => {
    if (error instanceof RankaNotFoundError) notFound();
    throw error;
  });
  const { sucesso, erro, period: periodValue, date, etapa } = await searchParams;
  const period = parsePortalPeriod(periodValue, date);
  const statsSnapshot = active === "estatisticas" && snapshot.portal
    ? await new PublicPortalRepository(client).getSnapshot({ slug: snapshot.portal.slug, period: period.period, date: period.date }).catch(() => null)
    : null;
  const sessionSummary = active === "estatisticas" && snapshot.sessionId ? await repository.getSessionSummary(snapshot.sessionId).catch(() => undefined) : undefined;
  return <RealRankaWorkspace active={active} snapshot={snapshot} success={sucesso} error={erro} publicSnapshot={statsSnapshot ?? undefined} sessionSummary={sessionSummary} statsDate={period.date} gameStage={etapa} />;
}
