import { notFound, redirect } from "next/navigation";
import { RankaWorkspace } from "@/components/ranka-workspace";
import { RealRankaWorkspace } from "@/components/real-ranka-workspace";
import { RankaHistory } from "@/components/ranka-history";
import { RankaNotFoundError, SupabaseRankaRepository } from "@/data/supabase/supabase-ranka-repository";
import { PublicPortalRepository } from "@/data/supabase/public-portal-repository";
import { parsePortalPeriod } from "@/domain/public-portal/rules";
import { isRankaSection } from "@/lib/navigation";
import { hasSupabaseConfig, isDemoEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";
import type { PlayerActivity } from "@/domain/player-activity";
import { scheduleSchema } from "@/domain/ranka/schedule";
import { randomUUID } from "node:crypto";
import type { PendingContribution } from "@/domain/player-activity";

export default async function RankaPage({ params, searchParams }: { params: Promise<{ rankaId: string; section?: string[] }>; searchParams: Promise<{ sucesso?: string; erro?: string; period?: string; date?: string; etapa?: string; dia?: string; pagina?: string; mes?: string; filtro?: string }> }) {
  const { rankaId, section } = await params;
  const active = section?.[0] ?? "inicio";
  if (!isRankaSection(active)) notFound();
  if (rankaId === "demo") {
    if (!isDemoEnabled()) redirect("/entrar");
    return <RankaWorkspace initialSection={active} />;
  }
  if (!hasSupabaseConfig()) redirect("/entrar");
  const client = await createClient();
  await requireUserId({ client });
  const { sucesso, erro, period: periodValue, date, etapa, dia, pagina, mes, filtro } = await searchParams;
  if (active === "historico") {
    const { data: ranka, error: rankaError } = await client.from("rankas").select("id,name,org_id").eq("id", rankaId).maybeSingle();
    if (rankaError) throw new Error("Não foi possível abrir o histórico.");
    if (!ranka) notFound();
    return <RankaHistory client={client} rankaId={rankaId} rankaName={ranka.name} orgId={ranka.org_id} selectedId={dia} page={pagina} month={mes} success={sucesso} failure={erro} />;
  }
  const repository = new SupabaseRankaRepository(client);
  const [snapshot, activityResult, settingsResult, pendingResult] = await Promise.all([
    repository.getSnapshot(rankaId).catch((error: unknown) => {
      if (error instanceof RankaNotFoundError) notFound();
      throw error;
    }),
    active === "jogadores" || active === "inicio" ? client.rpc("get_ranka_player_activity", { p_ranka_id: rankaId }) : undefined,
    ["jogadores", "inicio", "configuracoes"].includes(active) ? client.from("rankas").select("settings_json,revision").eq("id", rankaId).single() : undefined,
    active === "jogadores" ? client.rpc("get_ranka_pending_contributions", { p_ranka_id: rankaId }) : undefined,
  ]);
  if (activityResult?.error) throw new Error("Não foi possível carregar o acompanhamento dos jogadores.");
  if (settingsResult?.error) throw new Error("Não foi possível carregar as configurações de alerta.");
  const settings = settingsResult?.data;
  const rawMonths = Number(settings?.settings_json?.inactivityAlertMonths ?? 6);
  const inactivitySettings = settings ? { months: Number.isInteger(rawMonths) && rawMonths >= 1 && rawMonths <= 24 ? rawMonths : 6, revision: settings.revision } : undefined;

  const period = parsePortalPeriod(periodValue, date);
  const [statsSnapshot, sessionSummary] = active === "estatisticas" ? await Promise.all([
    snapshot.portal && new PublicPortalRepository(client).getSnapshot({ slug: snapshot.portal.slug, period: period.period, date: period.date, internal: true }).catch(() => null),
    snapshot.sessionId ? repository.getSessionSummary(snapshot.sessionId).catch(() => undefined) : undefined,
  ]) : [];
  const playerActivity = activityResult ? (activityResult.data ?? []) as PlayerActivity[] : undefined;
  const pending = ((pendingResult?.data ?? []) as Omit<PendingContribution, "requestId">[]).map((row) => ({ ...row, requestId: randomUUID() }));
  const schedule = scheduleSchema.safeParse(settings?.settings_json?.schedule).data ?? { mode: "unset" as const };
  return <RealRankaWorkspace active={active} snapshot={snapshot} success={sucesso} error={erro} publicSnapshot={statsSnapshot ?? undefined} sessionSummary={sessionSummary} statsDate={period.date} gameStage={etapa} playerActivity={playerActivity} inactivitySettings={inactivitySettings} schedule={schedule} pending={pending} pendingUnavailable={Boolean(pendingResult?.error)} debtFilter={filtro === "pendentes"} />;
}
