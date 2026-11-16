"use client";

import { useId, useRef, useState } from "react";

export function InviteLink({ link }: { link: string }) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string>();
  return <div className="field admin-plan-reason">
    <label htmlFor={id}>Link do convite</label>
    <input className="input" id={id} ref={field} readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
    <button className="button button-secondary" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(link); setCopied(link); }
      catch { field.current?.focus(); field.current?.select(); }
    }}>{copied === link ? "Copiado" : "Copiar link"}</button>
  </div>;
}
