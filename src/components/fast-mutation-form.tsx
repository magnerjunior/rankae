"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FastMutationResult } from "@/app/app/rankas/[rankaId]/actions";

export function FastMutationForm({ action, className, children }: { action: (formData: FormData) => Promise<FastMutationResult>; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (formData: FormData) => {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const result = await action(formData);
      setMessage(result.message);
      if (result.status === "success") {
        if (result.nextPath) router.replace(result.nextPath);
        router.refresh();
      }
    } catch {
      setMessage("Sem conexão para confirmar. Tente novamente.");
    }
    setPending(false);
  };
  return <form className={className} action={submit} aria-busy={pending}>
    {children}
    {pending && <span className="fast-action-state" role="status">Salvando…</span>}
    {!pending && message && <span className="fast-action-state" role="status">{message}</span>}
  </form>;
}
