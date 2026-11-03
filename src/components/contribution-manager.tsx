"use client";

import { useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  detail: string;
  status: "pending" | "paid" | "waived";
};
const labels = { pending: "Pendente", paid: "Pago", waived: "Isento" } as const;

export function ContributionManager({
  rows,
  action,
}: {
  rows: Row[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const visible = useMemo(
    () =>
      rows.filter((row) =>
        row.name
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
      ),
    [query, rows],
  );
  const allVisible =
    visible.length > 0 && visible.every((row) => selected.includes(row.id));
  const toggleAll = () =>
    setSelected((current) =>
      allVisible
        ? current.filter((id) => !visible.some((row) => row.id === id))
        : [...new Set([...current, ...visible.map((row) => row.id)])],
    );
  return (
    <form action={action}>
      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
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
          onClick={toggleAll}
        >
          {allVisible ? "Desmarcar todos" : "Selecionar todos"}
        </button>
      </div>
      <div className="contribution-list">
        {visible.map((row, index) => (
          <label
            className={`person-row check-person contribution-row ${index % 2 ? "alternate" : ""}`}
            key={row.id}
          >
            <input
              type="checkbox"
              name="playerIds"
              value={row.id}
              checked={selected.includes(row.id)}
              onChange={() =>
                setSelected((current) =>
                  current.includes(row.id)
                    ? current.filter((id) => id !== row.id)
                    : [...current, row.id],
                )
              }
            />
            <span className="person-info">
              <strong>{row.name}</strong>
              <small>{row.detail}</small>
            </span>
            <span className={`status-pill status-${row.status}`}>
              {labels[row.status]}
            </span>
          </label>
        ))}
      </div>
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
        <button className="button button-primary" disabled={!selected.length}>
          Aplicar a {selected.length || 0}
        </button>
      </div>
    </form>
  );
}
