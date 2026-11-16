import { notFound, redirect } from "next/navigation";
import type { RankaDayOverview } from "@/data/ports/ranka-repository";
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
import { getAccountTrial } from "@/server/account-trial";
import type { PlayerActivity } from "@/domain/player-activity";
import { scheduleSchema } from "@/domain/ranka/schedule";
import { randomUUID } from "node:crypto";
import { TeamPanel, type Team } from "@/app/app/equipe/team-panel";
import type { PendingContribution } from "@/domain/player-activity";

export default async function RankaPage({ params, searchParams }: { params: Promise<{ rankaId: string; section?: string[] }>; searchParams: Promise<{ sucesso?: string; erro?: string; period?: string; date?: string; etapa?: string; dia?: string; pagina?: string; mes?: string; filtro?: string; equipe_erro?: string; equipe_sucesso?: string }> }) {
  const { rankaId, section } = await params;
  const active = section?.[0] ?? "inicio";
  if (!isRankaSection(active)) notFound();
  if (rankaId === "demo") {
    if (!isDemoEnabled()) redirect("/entrar");
    return <RankaWorkspace initialSection={active} />;
  }
  if (!hasSupabaseConfig()) redirect("/entrar");
  const client = await createClient();
  const userId = await requireUserId({ client });
  const { sucesso, erro, period: periodValue, date, etapa, dia, pagina, mes, filtro, equipe_erro, equipe_sucesso } = await searchParams;
  if (active === "historico") {
    const [{ data: ranka, error: rankaError }, trial] = await Promise.all([
      client.from("rankas").select("id,name,org_id").eq("id", rankaId).maybeSingle(), getAccountTrial(client, rankaId),
    ]);
    if (rankaError) throw new Error("Não foi possível abrir o histórico.");
    if (!ranka) notFound();
    return <RankaHistory client={client} rankaId={rankaId} rankaName={ranka.name} orgId={ranka.org_id} selectedId={dia} page={pagina} month={mes} success={sucesso} failure={erro} trial={trial} />;
  }
  const repository = new SupabaseRankaRepository(client);
  const [snapshot, activityResult, settingsResult, pendingResult, trial, teamsResult, overviewResult] = await Promise.all([
    repository.getSnapshot(rankaId).catch((error: unknown) => {
      if (error instanceof RankaNotFoundError) notFound();
      throw error;
    }),
    active === "jogadores" || active === "inicio" ? client.rpc("get_ranka_player_activity", { p_ranka_id: rankaId }) : undefined,
    ["jogadores", "inicio", "configuracoes"].includes(active) ? client.from("rankas").select("settings_json,revision").eq("id", rankaId).single() : undefined,
    active === "jogadores" ? client.rpc("get_ranka_pending_contributions", { p_ranka_id: rankaId }) : undefined,
    getAccountTrial(client, rankaId),
    active === "configuracoes" ? client.rpc("get_owned_teams") : undefined,
    active === "inicio" ? client.rpc("get_ranka_day_overview", { p_ranka_id: rankaId }) : undefined,
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
  const team = ((teamsResult?.data ?? []) as Team[]).find((item) => item.id === snapshot.orgId);
  const teamTools = team ? <div id="equipe" className="settings-team">
    {equipe_erro && <p role="alert" className="notice notice-warning">Não foi possível alterar o acesso.</p>}
    {equipe_sucesso && <p role="status" className="notice">Acesso removido.</p>}
    <TeamPanel team={team} rankaId={rankaId} />
  </div> : teamsResult?.error ? <p id="equipe" role="alert" className="notice notice-warning">Não foi possível carregar a equipe.</p> : undefined;
  return <RealRankaWorkspace userId={userId} active={active} snapshot={snapshot} success={sucesso} error={erro} publicSnapshot={statsSnapshot ?? undefined} sessionSummary={sessionSummary} statsDate={period.date} gameStage={etapa} playerActivity={playerActivity} inactivitySettings={inactivitySettings} schedule={schedule} pending={pending} pendingUnavailable={Boolean(pendingResult?.error)} playerFilter={filtro === "pendentes" ? "debt" : filtro === "ausentes" ? "inactive" : "all"} trial={trial} teamTools={teamTools} overview={overviewResult?.data as RankaDayOverview | undefined} />;
}
