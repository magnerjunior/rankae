import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

interface RankaRow { id: string; name: string; slug: string; visibility: string; }

export default async function AppPage() {
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.from("rankas").select("id,name,slug,visibility").order("created_at");
  const { data: adminCapability } = await supabase.rpc("get_platform_admin_capability");
  if (error) throw new Error("Não foi possível carregar os rankas autorizados.");
  const rankas = (data ?? []) as RankaRow[];
  if (!rankas.length) redirect("/app/configurar");

  const isAdmin = Boolean(adminCapability && typeof adminCapability === "object" && "active" in adminCapability && adminCapability.active === true);
  return <main className="page" style={{padding: "32px 20px 80px"}}><header className="between"><span className="brand"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></span><div className="cluster"><Link className="button button-quiet button-small" href="/app/privacidade">Privacidade</Link><Link className="button button-quiet button-small" href="/app/legal">Documentos</Link>{isAdmin && <Link className="button button-secondary button-small" href="/app/admin">Admin SaaS</Link>}<form action={signOutAction}><button className="button button-secondary button-small">Sair</button></form></div></header><header className="page-heading"><span className="eyebrow">Seus espaços</span><h1 className="display">Escolha um ranka</h1><p>Somente organizações permitidas pela política de acesso aparecem aqui.</p></header><div className="three-column">{rankas.map((ranka) => <Link className="panel" key={ranka.id} href={`/app/rankas/${ranka.id}`}><span className="badge badge-green">{ranka.visibility === "private_off" ? "Privado" : ranka.visibility}</span><h2 className="display" style={{fontSize: "2rem", margin: "14px 0 5px"}}>{ranka.name}</h2><span className="muted">/{ranka.slug}</span><div className="arrow" style={{marginTop: 24}}>Abrir →</div></Link>)}</div></main>;
}
