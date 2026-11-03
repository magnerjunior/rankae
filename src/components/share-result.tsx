"use client";

import { useState } from "react";

export function ShareResult({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const message = () => `${text}\n${window.location.href}`;
  async function copy() {
    await navigator.clipboard.writeText(message());
    setCopied(true);
  }
  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message())}`, "_blank", "noopener,noreferrer");
  }
  return <div className="cluster share-actions">
    <button className="button button-secondary" type="button" onClick={copy}>{copied ? "Resumo copiado" : "Copiar resumo"}</button>
    <button className="button button-primary" type="button" onClick={openWhatsApp}>Compartilhar no WhatsApp</button>
  </div>;
}

