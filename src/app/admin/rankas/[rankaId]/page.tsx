import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { AdminNavigation } from "../../admin-navigation";

export const metadata = { title: "Inspeção do ranka | Rankaê", robots: { index: false, follow: false } };
const states: Record<string, string> = { planned: "Planejado", check_in: "Chegada", team_formation: "Formação de times", running: "Em andamento", paused: "Pausado", completed: "Encerrado" };

type Review = { name: string; organization: string; ownerId: string; publicSlug: string | null; days: { date: string; number: number; state: string; matches: number; manualReview: number }[] };

export default async function AdminRankaReview({ params }: { params: Promise<{ rankaId: string }> }) {
  const { rankaId } = await params;
  if (!z.uuid().safeParse(rankaId).success) notFound();
  const client = await requirePlatformAdmin();
  const { data, error } = await client.rpc("admin_get_ranka_review", { p_ranka_id: rankaId });
  if (error) throw new Error("Não foi possível consultar o ranka.");
  if (!data) notFound();
  const review = data as Review;
  return <main className="page trust-page admin-page">
    <AdminNavigation />
    <Link className="text-link" href={`/admin/contas/${review.ownerId}`}>Voltar para a conta</Link>
    <header className="page-heading"><span className="eyebrow">{review.organization}</span><h1 className="display">{review.name}</h1><p>Consulte o estado dos encontros e as partidas que precisam de revisão.</p></header>
    {review.publicSlug && <Link className="button button-secondary" href={`/r/${review.publicSlug}`} target="_blank" rel="noreferrer">Abrir portal público</Link>}
    <section className="panel admin-section">
      <h2 className="panel-title display">Últimos encontros</h2>
      {review.days.length === 0 ? <p className="muted">Nenhum encontro registrado.</p> : <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Data</th><th>Estado</th><th>Partidas</th><th>Em revisão</th></tr></thead>
        <tbody>{review.days.map((day) => <tr key={`${day.date}-${day.number}`}><td>{day.date.split("-").reverse().join("/")}{day.number > 1 && ` · ${day.number}º encontro`}</td><td>{states[day.state] ?? day.state}</td><td>{day.matches}</td><td>{day.manualReview}</td></tr>)}</tbody>
      </table></div>}
    </section>
  </main>;
}
