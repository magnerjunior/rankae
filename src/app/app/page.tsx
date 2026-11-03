import Link from "next/link";
import { redirect } from "next/navigation";
import { createRankaAction, signOutAction } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

interface RankaRow { id: string; name: string; slug: string; visibility: string; }
interface OrganizationRow { id: string; name: string; owner_user_id: string; }

export default async function AppPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const userId = await requireUserId();
  const supabase = await createClient();
  const [{ data, error }, { data: organizationData }] = await Promise.all([
    supabase.from("rankas").select("id,name,slug,visibility").order("created_at"),
    supabase.from("organizations").select("id,name,owner_user_id").order("created_at"),
  ]);
  const { data: adminCapability } = await supabase.rpc("get_platform_admin_capability");
  if (error) throw new Error("Não foi possível carregar os rankas autorizados.");
  const rankas = (data ?? []) as RankaRow[];
  const ownedOrganizations = ((organizationData ?? []) as OrganizationRow[]).filter((organization) => organization.owner_user_id === userId);
  if (!rankas.length) redirect("/app/configurar");
  const { erro } = await searchParams;

  const isAdmin = Boolean(adminCapability && typeof adminCapability === "object" && "active" in adminCapability && adminCapability.active === true);
  const canCreate = ownedOrganizations.length > 0 && rankas.length < 3;
  return <main className="page ranka-picker"><header className="between ranka-picker-head"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span><details className="account-menu"><summary className="button button-secondary button-small">Menu</summary><div className="account-popover"><Link href="/app/privacidade">Privacidade</Link><Link href="/app/legal">Documentos</Link>{isAdmin && <Link href="/app/admin">Administração</Link>}<form action={signOutAction}><button>Sair</button></form></div></details></header><header className="page-heading"><span className="eyebrow">Meus rankas</span><h1 className="display">Qual vai rolar?</h1></header>{erro && <div className="notice notice-warning">Não foi possível criar o ranka. Confira o limite de três e tente novamente.</div>}<div className="ranka-grid">{rankas.map((ranka) => <Link className="ranka-card glass-panel" key={ranka.id} href={`/app/rankas/${ranka.id}`}><span className="ranka-card-number">{String(rankas.indexOf(ranka) + 1).padStart(2, "0")}</span><h2 className="display">{ranka.name}</h2><span>Abrir ranka <b>→</b></span></Link>)}{canCreate && <details className="ranka-card ranka-create"><summary><span className="ranka-card-plus">+</span><strong>Novo ranka</strong><small>{rankas.length} de 3 criados</small></summary><form action={createRankaAction} className="stack"><input type="hidden" name="orgId" value={ownedOrganizations[0].id} /><label className="field">Nome<input className="input" name="name" required minLength={2} maxLength={100} autoFocus placeholder="Ex.: Futebol de quarta" /></label><button className="button button-primary">Criar ranka</button></form></details>}</div></main>;
}
