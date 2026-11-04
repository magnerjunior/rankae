import { notFound, redirect } from "next/navigation";
import { RankaWorkspace } from "@/components/ranka-workspace";
import { RealRankaWorkspace } from "@/components/real-ranka-workspace";
import { RankaHistory } from "@/components/ranka-history";
import { RankaNotFoundError, SupabaseRankaRepository } from "@/data/supabase/supabase-ranka-repository";
import { PublicPortalRepository } from "@/data/supabase/public-portal-repository";
import { parsePortalPeriod } from "@/domain/public-portal/rules";
import type { PlayerActivity } from "@/domain/player-activity";
import { isRankaSection } from "@/lib/navigation";
import { isDemoEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

export default async function RankaPage({ params, searchParams }: { params: Promise<{ rankaId: string; section?: string[] }>; searchParams: Promise<{ sucesso?: string; erro?: string; period?: string; date?: string; etapa?: string; dia?: string; pagina?: string; mes?: string }> }) {
  const { rankaId, section } = await params;
  const active = section?.[0] ?? "inicio";
  if (!isRankaSection(active)) notFound();
  if (rankaId === "demo") {
    if (!isDemoEnabled()) redirect("/entrar");
    return <RankaWorkspace initialSection={active} />;
  }
  await requireUserId();
  const client = await createClient();
  const { sucesso, erro, period: periodValue, date, etapa, dia, pagina, mes } = await searchParams;
  if (active === "historico") {
    const { data: ranka, error: rankaError } = await client.from("rankas").select("id,name,org_id").eq("id", rankaId).maybeSingle();
    if (rankaError) throw new Error("Não foi possível abrir o histórico.");
    if (!ranka) notFound();
    return <RankaHistory client={client} rankaId={rankaId} rankaName={ranka.name} orgId={ranka.org_id} selectedId={dia} page={pagina} month={mes} />;
  }
  const repository = new SupabaseRankaRepository(client);
  const snapshot = await repository.getSnapshot(rankaId).catch((error: unknown) => {
    if (error instanceof RankaNotFoundError) notFound();
    throw error;
  });
  const period = parsePortalPeriod(periodValue, date);
  const statsSnapshot = active === "estatisticas" && snapshot.portal
    ? await new PublicPortalRepository(client).getSnapshot({ slug: snapshot.portal.slug, period: period.period, date: period.date }).catch(() => null)
    : null;
  const sessionSummary = active === "estatisticas" && snapshot.sessionId ? await repository.getSessionSummary(snapshot.sessionId).catch(() => undefined) : undefined;
  let playerActivity: PlayerActivity[] | undefined;
  let inactivitySettings: { months: number; revision: number } | undefined;
  if (active === "jogadores" || active === "inicio") {
    const activityResult = await client.rpc("get_ranka_player_activity", { p_ranka_id: rankaId });
    if (activityResult.error) throw new Error("Não foi possível carregar o acompanhamento dos jogadores.");
    playerActivity = (activityResult.data ?? []) as PlayerActivity[];
    if (active === "jogadores") {
      const { data: settings, error: settingsError } = await client.from("rankas").select("settings_json,revision").eq("id", rankaId).single();
      if (settingsError) throw new Error("Não foi possível carregar as configurações de alerta.");
      const rawMonths = Number(settings.settings_json?.inactivityAlertMonths ?? 6);
      inactivitySettings = { months: Number.isInteger(rawMonths) && rawMonths >= 1 && rawMonths <= 24 ? rawMonths : 6, revision: settings.revision };
    }
  }
  return <RealRankaWorkspace active={active} snapshot={snapshot} success={sucesso} error={erro} publicSnapshot={statsSnapshot ?? undefined} sessionSummary={sessionSummary} statsDate={period.date} gameStage={etapa} playerActivity={playerActivity} inactivitySettings={inactivitySettings} />;
}
