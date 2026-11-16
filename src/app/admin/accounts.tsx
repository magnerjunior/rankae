import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { formatCurrency } from "@/lib/commercial";
import { recordReceiptAction } from "./actions";
import { OrganizerInvite } from "./organizer-invite";

type Account = { id: string; email: string; limit: number; used: number; expiresAt: string | null };
type Profile = { id: string; name: string | null; mode: "trial" | "active" | "collaborator"; paying: boolean };
type Receipt = { id: string; email: string; amount: number; date: string; reference: string };

export async function AdminAccounts({ client, trialDays }: { client: SupabaseClient; trialDays: number }) {
  const [{ data, error }, profiles] = await Promise.all([client.rpc("admin_get_accounts_and_receipts"), client.rpc("admin_get_account_profiles")]);
  if (error || !data || profiles.error) return <section className="panel admin-section"><h2 className="panel-title display">Contas e financeiro</h2><p>Dados administrativos indisponíveis.</p></section>;
  const { accounts, receipts, total, month } = data as { accounts: Account[]; receipts: Receipt[]; total: number; month: number };
  const byId = new Map(((profiles.data ?? []) as Profile[]).map((profile) => [profile.id, profile]));
  const options = accounts.map((account) => <option key={account.id} value={account.id}>{[byId.get(account.id)?.name, account.email].filter(Boolean).join(" · ")}</option>);
  const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
  return <>
    <section className="panel admin-section" id="contas">
      <h2 className="panel-title display">Contas e testes</h2>
      <details className="admin-account-create"><summary>Adicionar conta</summary>
        <OrganizerInvite trialDays={trialDays} />
      </details>
      <p>{accounts.length} {accounts.length === 1 ? "conta cadastrada" : "contas cadastradas"}</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Responsável</th><th>Rankas</th><th>Acesso</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>
        {accounts.map((account) => {
          const profile = byId.get(account.id);
          const status = profile?.mode === "collaborator" ? "Colaborador" : profile?.mode === "trial" ? `Teste${account.expiresAt ? ` · ${dateLabel(account.expiresAt)}` : ""}` : profile?.paying ? "Ativa · pagante" : "Ativa";
          return <tr key={account.id}><td><strong>{profile?.name ?? "Sem nome cadastrado"}</strong><br />{account.email}</td><td>{account.used} / {account.limit}</td><td>{status}</td><td><Link href={`/admin/contas/${account.id}`} className="button button-secondary button-small" aria-label={`Ver conta de ${profile?.name ?? account.email}`}>Ver conta</Link></td></tr>;
        })}
      </tbody></table></div>
    </section>
    <section className="panel admin-section" id="financeiro">
      <h2 className="panel-title display">Financeiro</h2>
      <div className="metric-grid admin-section"><article className="metric"><span>Recebido no mês</span><strong>{formatCurrency(month)}</strong></article><article className="metric"><span>Total registrado</span><strong>{formatCurrency(total)}</strong></article></div>
      <form action={recordReceiptAction} className="admin-plan-form">
        <input type="hidden" name="requestId" value={randomUUID()} />
        <label className="field">Conta<select className="select" name="userId" required>{options}</select></label>
        <label className="field">Valor recebido<input className="input" type="number" name="amount" min=".01" max="1000000" step=".01" required /></label>
        <label className="field">Data do recebimento<input className="input" type="date" name="receivedOn" required /></label>
        <label className="field admin-plan-reason">Referência do pagamento<input className="input" name="reference" minLength={8} maxLength={500} required /></label>
        <button className="button button-primary">Registrar recebimento</button>
      </form>
      {receipts.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>Data</th><th>Conta</th><th>Referência</th><th>Valor</th></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id}><td>{dateLabel(receipt.date)}</td><td>{receipt.email}</td><td>{receipt.reference}</td><td>{formatCurrency(receipt.amount)}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
