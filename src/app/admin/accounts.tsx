import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { formatCurrency } from "@/lib/commercial";
import { adminAuthConfigured } from "@/lib/supabase/admin-auth";
import { grantTrialAction, inviteOrganizerAction, recordReceiptAction } from "./actions";

type Account = { id: string; email: string; limit: number; used: number; trialLimit: number | null; expiresAt: string | null; trialActive: boolean };
type Receipt = { id: string; email: string; amount: number; date: string; reference: string };

export async function AdminAccounts({ client }: { client: SupabaseClient }) {
  const { data, error } = await client.rpc("admin_get_accounts_and_receipts");
  if (error || !data) return <section className="panel admin-section"><h2 className="panel-title display">Contas e financeiro</h2><p>Dados administrativos indisponíveis.</p></section>;
  const { accounts, receipts, total, month, activeTrials } = data as { accounts: Account[]; receipts: Receipt[]; total: number; month: number; activeTrials: number };
  const options = accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>);
  const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
  return <>
    <section className="panel admin-section">
      <h2 className="panel-title display">Contas e testes</h2>
      {adminAuthConfigured() ? <form className="admin-plan-form" action={inviteOrganizerAction}>
        <label className="field">E-mail do novo organizador<input type="email" name="email" className="input" maxLength={254} required /></label>
        <button className="button button-primary">Convidar organizador</button>
      </form> : <p className="muted">O envio de convites está indisponível neste ambiente.</p>}
      <form className="admin-plan-form" action={grantTrialAction}>
        <label className="field">Conta<select className="select" name="userId" required>{options}</select></label>
        <label className="field">Limite de rankas durante o teste<input type="number" className="input" name="limit" min="1" max="100" defaultValue="1" required /></label>
        <label className="field">Dias de teste<input type="number" className="input" name="days" min="1" max="365" defaultValue="30" required /></label>
        <label className="field admin-plan-reason">Motivo<input name="reason" className="input" minLength={8} maxLength={500} required /></label>
        <button className="button button-primary">Liberar teste</button>
      </form>
      <p>{activeTrials} {activeTrials === 1 ? "teste ativo" : "testes ativos"}</p>
      <p className="muted">Ao vencer o teste, o limite volta ao valor base. Os rankas já criados continuam acessíveis.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Conta</th><th>Rankas criados</th><th>Limite base</th><th>Teste</th></tr></thead><tbody>
        {accounts.map((account) => <tr key={account.id}><td>{account.email}</td><td>{account.used}</td><td>{account.limit}</td><td>{account.expiresAt ? `${account.trialLimit} ranka(s) · ${account.trialActive ? "até" : "expirou em"} ${dateLabel(account.expiresAt)}` : "—"}</td></tr>)}
      </tbody></table></div>
    </section>
    <section className="panel admin-section">
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
