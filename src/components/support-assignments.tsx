"use client";

import { useEffect, useRef } from "react";

type Option = { id: string; name: string };

export function SupportAssignments({
  action,
  keepers,
  ballBoys,
  defaults,
  autoSave,
}: {
  action: (formData: FormData) => void | Promise<void>;
  keepers: Option[];
  ballBoys: Option[];
  defaults: { yellow?: string; red?: string; first?: string; second?: string };
  autoSave: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (
      autoSave &&
      !submitted.current &&
      (defaults.yellow || defaults.red || defaults.first || defaults.second)
    ) {
      submitted.current = true;
      formRef.current?.requestSubmit();
    }
  }, [autoSave, defaults]);
  const save = () => formRef.current?.requestSubmit();
  const options = (items: Option[], blank: string) => (
    <>
      <option value="">{blank}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </>
  );
  return (
    <form ref={formRef} className="support-grid" action={action}>
      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
      <label className="field">
        Goleiro amarelo
        <select
          className="select"
          name="yellowKeeperId"
          defaultValue={defaults.yellow}
          onChange={save}
        >
          {options(keepers, "Sem goleiro")}
        </select>
      </label>
      <label className="field">
        Goleiro vermelho
        <select
          className="select"
          name="redKeeperId"
          defaultValue={defaults.red}
          onChange={save}
        >
          {options(keepers, "Sem goleiro")}
        </select>
      </label>
      <div className="support-ballboys">
        <span>Gandulas · próximos da fila</span>
        <div className="support-picks">
          <label>
            <b>1º</b>
            <select
              className="select"
              name="ballBoyIds"
              defaultValue={defaults.first}
              onChange={save}
            >
              {options(ballBoys, "Não definido")}
            </select>
          </label>
          <label>
            <b>2º</b>
            <select
              className="select"
              name="ballBoyIds"
              defaultValue={defaults.second}
              onChange={save}
            >
              {options(ballBoys, "Não definido")}
            </select>
          </label>
        </div>
        <small>
          A escala fica salva automaticamente. Toque no nome para trocar.
        </small>
      </div>
    </form>
  );
}
