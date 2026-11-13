import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PrivacyGate } from "@/components/privacy-gate";
import { PublicPortalView } from "@/components/public-portal-view";
import { PublicPortalRepository } from "@/data/supabase/public-portal-repository";
import { parsePortalPeriod } from "@/domain/public-portal/rules";
import { createClient } from "@/lib/supabase/server";
import { portalCookieName } from "@/server/public-portal";
import type { PortalGateState } from "@/domain/public-portal/types";

export const dynamic = "force-dynamic";

async function repository() { return new PublicPortalRepository(await createClient()); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const gate: PortalGateState = await repository().then((portal) => portal.getGate(slug)).catch(() => ({ status: "unavailable" }));
  if (gate.status !== "open") return { title: "Portal do ranka · Rankaê", robots: { index: false, follow: false }, openGraph: null, twitter: null };
  const title = `${gate.rankaName ?? "Ranka"} | Rankings e resultados · Rankaê`;
  const description = "Veja os resultados das partidas e os rankings de gols, assistências e vitórias.";
  return { title, description, alternates: { canonical: `/r/${encodeURIComponent(slug)}` }, openGraph: { title, description, url: `/r/${encodeURIComponent(slug)}` } };
}

export default async function PublicRankaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ period?: string; date?: string; month?: string; token?: string; acesso?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const period = parsePortalPeriod(query.period, query.date || today);
  const cookieStore = await cookies();
  const grant = cookieStore.get(portalCookieName(slug))?.value;
  const portal = await repository();
  const snapshot = await portal.getSnapshot({ slug, grant, period: period.period, date: period.date }).catch(() => null);
  if (snapshot) {
    const calendarDate = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? query.month! : (period.date ?? snapshot.sessionDate ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
    const calendar = snapshot.period === "day" ? await portal.getCalendar({ slug, grant, month: calendarDate }).catch(() => []) : [];
    return <PublicPortalView snapshot={snapshot} date={period.date} calendar={calendar} calendarMonth={calendarDate} />;
  }
  const gate: PortalGateState = await portal.getGate(slug).catch(() => ({ status: "unavailable" }));
  if (gate.status === "open") return <main className="public-portal"><h1 className="display">Resultados indisponíveis</h1><p>Tente abrir o portal novamente em instantes.</p></main>;
  if (gate.status === "link_required" && query.token) redirect(`/r/${slug}/acesso?token=${encodeURIComponent(query.token)}`);
  return <PrivacyGate slug={slug} gate={gate} linkToken={query.token} error={query.acesso} />;
}

