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
  const gate: PortalGateState = await (await repository()).getGate(slug).catch(() => ({ status: "unavailable" }));
  return { title: gate.rankaName ? `${gate.rankaName} · Rankaê` : "Portal do ranka · Rankaê", robots: gate.status === "open" ? { index: true, follow: true } : { index: false, follow: false } };
}

export default async function PublicRankaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ period?: string; date?: string; token?: string; acesso?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const period = parsePortalPeriod(query.period, query.date);
  const cookieStore = await cookies();
  const grant = cookieStore.get(portalCookieName(slug))?.value;
  const portal = await repository();
  const snapshot = await portal.getSnapshot({ slug, grant, period: period.period, date: period.date }).catch(() => null);
  if (snapshot) return <PublicPortalView snapshot={snapshot} date={period.date} />;
  const gate: PortalGateState = await portal.getGate(slug).catch(() => ({ status: "unavailable" }));
  if (gate.status === "open") redirect(`/r/${slug}`);
  if (gate.status === "link_required" && query.token) redirect(`/r/${slug}/acesso?token=${encodeURIComponent(query.token)}`);
  return <PrivacyGate slug={slug} gate={gate} linkToken={query.token} error={query.acesso} />;
}

