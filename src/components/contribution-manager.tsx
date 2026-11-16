"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContributionMutationResult } from "@/app/app/rankas/[rankaId]/actions";

type Row = {
  id: string;
  name: string;
  detail: string;
  status: "pending" | "paid" | "waived";
  automaticWaiver?: boolean;
};
const labels = { pending: "Pendente", paid: "Pago", waived: "Isento" } as const;

export function ContributionManager({
  rows,
  action,
}: {
  rows: Row[];
  action: (formData: FormData) => Promise<ContributionMutationResult>;
}) {
  const router = useRouter();
  const [currentRows, setCurrentRows] = useState(rows);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const visible = useMemo(
    () =>
      currentRows.filter((row) =>
        row.name
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
      ),
    [query, currentRows],
  );
  const separate = (row: Row) => row.status === "waived" || row.automaticWaiver;
  const billable = visible.filter((row) => !separate(row));
  const waived = visible.filter(separate);
  const allVisible =
    billable.length > 0 && billable.every((row) => selected.includes(row.id));
  const toggleAll = () =>
    setSelected((current) =>
      allVisible
        ? []
        : [...new Set([...current, ...billable.map((row) => row.id)])],
    );
  const submit = async (formData: FormData) => {
    if (!selected.length || pending) return;
    const status = String(formData.get("status")) as Row["status"];
    const before = currentRows;
    setCurrentRows((items) => items.map((item) => selected.includes(item.id) ? { ...item, status } : item));
    setPending(true);
    setMessage("");
    try {
      const result = await action(formData);
      if (result.status === "error") {
        setCurrentRows(before);
        setMessage(result.message);
      } else {
        setSelected([]);
        setMessage(result.message);
        setKey(crypto.randomUUID());
        router.refresh();
      }
    } catch {
      setCurrentRows(before);
      setMessage("Sem conexão para confirmar. Tente novamente.");
    }
    setPending(false);
  };
  const entry = (row: Row, index: number) => (
    <label className={`person-row check-person contribution-row ${index % 2 ? "alternate" : ""}`} key={row.id}>
      <input type="checkbox" checked={selected.includes(row.id)} onChange={() =>
        setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])
      } />
      <span className="person-info"><strong>{row.name}</strong><small>{row.detail}</small></span>
      <span className={`status-pill status-${row.status}`}>{labels[row.status]}</span>
    </label>
  );
  return (
    <form action={submit}>
      <input type="hidden" name="idempotencyKey" value={key} />
      {selected.map((id) => <input key={id} type="hidden" name="playerIds" value={id} />)}
      <div className="contribution-tools">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar jogador"
        />
        <button
          className="button button-secondary"
          type="button"
          disabled={!billable.length}
          onClick={toggleAll}
        >
          {allVisible ? "Desmarcar todos" : "Selecionar todos, exceto isentos"}
        </button>
      </div>
      <div className="contribution-list">
        {billable.map(entry)}
      </div>
      {waived.length > 0 && <details className="contribution-exempt"><summary>Isenções e pagamentos individuais ({waived.length})</summary>{waived.map(entry)}</details>}
      <div className="bulk-bar">
        <select className="select compact-select" name="status">
          <option value="paid">Marcar como pago</option>
          <option value="pending">Marcar como pendente</option>
          <option value="waived">Marcar como isento</option>
        </select>
        <input
          className="input"
          name="note"
          placeholder="Observação opcional"
        />
        <button className="button button-primary" disabled={!selected.length || pending}>
          {pending ? "Aplicando…" : `Aplicar a ${selected.length || 0}`}
        </button>
      </div>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
