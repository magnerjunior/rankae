import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createRankaAction, signOutAction } from "./actions";
import { commercialPlanSchema, DEFAULT_COMMERCIAL_PLAN, EXTRA_RANKA_MESSAGE, formatCurrency, whatsappLink } from "@/lib/commercial";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

interface RankaRow { id: string; name: string; slug: string; visibility: string; }
interface OrganizationRow { id: string; name: string; owner_user_id: string; }
const entitlementSchema = z.object({ limit: z.number().int().positive(), used: z.number().int().nonnegative(), canCreate: z.boolean() });

export default async function AppPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const userId = await requireUserId();
  const supabase = await createClient();
  const [{ data, error }, { data: organizationData }, capabilityResult, entitlementResult, planResult] = await Promise.all([
    supabase.from("rankas").select("id,name,slug,visibility").order("created_at"),
    supabase.from("organizations").select("id,name,owner_user_id").order("created_at"),
    supabase.rpc("get_platform_admin_capability"),
    supabase.rpc("get_ranka_entitlement"),
    supabase.rpc("get_commercial_plan"),
  ]);
  if (error) throw new Error("Não foi possível carregar os rankas autorizados.");
  const rankas = (data ?? []) as RankaRow[];
  const ownedOrganizations = ((organizationData ?? []) as OrganizationRow[]).filter((organization) => organization.owner_user_id === userId);
  if (!rankas.length) redirect("/app/configurar");
  const { erro } = await searchParams;
  const adminCapability = capabilityResult.data;
  const isAdmin = Boolean(adminCapability && typeof adminCapability === "object" && "active" in adminCapability && adminCapability.active === true);
  const entitlement = entitlementSchema.safeParse(entitlementResult.data).success ? entitlementSchema.parse(entitlementResult.data) : { limit: 1, used: rankas.length, canCreate: false };
  const parsedPlan = commercialPlanSchema.safeParse(planResult.data);
  const plan = parsedPlan.success ? parsedPlan.data : DEFAULT_COMMERCIAL_PLAN;
  const canCreate = ownedOrganizations.length > 0 && entitlement.canCreate;
  const acquireHref = whatsappLink(EXTRA_RANKA_MESSAGE);

  return <main className="page ranka-picker">
    <header className="between ranka-picker-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span><details className="account-menu"><summary className="button button-secondary button-small">Menu</summary><div className="account-popover"><Link href="/app/privacidade">Privacidade</Link><Link href="/app/legal">Documentos</Link>{isAdmin && <Link href="/admin">Administração</Link>}<form action={signOutAction}><button>Sair</button></form></div></details></header>
    <header className="page-heading"><span className="eyebrow">Meus rankas</span><h1 className="display">Qual vai rolar?</h1></header>
    {erro && <div className="notice notice-warning">Não foi possível criar o ranka. Revise os dados ou fale com o suporte para ampliar seu plano.</div>}
    <div className="ranka-grid">
      {rankas.map((ranka, index) => <Link className="ranka-card glass-panel" key={ranka.id} href={`/app/rankas/${ranka.id}`}><span className="ranka-card-number">{String(index + 1).padStart(2, "0")}</span><h2 className="display">{ranka.name}</h2><span>Abrir ranka <b>→</b></span></Link>)}
      {canCreate && <details className="ranka-card ranka-create"><summary><span className="ranka-card-plus">+</span><strong>Novo ranka</strong><small>{entitlement.used} de {entitlement.limit} criados</small></summary><form action={createRankaAction} className="stack"><input type="hidden" name="orgId" value={ownedOrganizations[0].id} /><label className="field">Nome<input className="input" name="name" required minLength={2} maxLength={100} autoFocus placeholder="Ex.: Futebol de quarta" /></label><button className="button button-primary">Criar ranka</button></form></details>}
      {!canCreate && ownedOrganizations.length > 0 && <a className="ranka-card ranka-upgrade" href={acquireHref} target="_blank" rel="noreferrer"><span className="ranka-card-plus">+</span><strong>Adquirir novo ranka</strong><small>Adicional por {formatCurrency(plan.extraRankaPriceCents)}/mês</small><span>Falar com o suporte <b>→</b></span></a>}
    </div>
  </main>;
}
