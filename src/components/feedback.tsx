"use client";

import { useEffect } from "react";

export function AuditBadge({ children = "Ação local registrada" }: { children?: React.ReactNode }) {
  return <span className="badge badge-green"><span className="status-dot" />{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty"><strong>{title}</strong><span>{description}</span>{action}</div>;
}

export function Toast({ message, onClose }: { message?: string; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}

export function ConfirmDialog({
  open, title, description, confirmLabel = "Confirmar", onConfirm, onCancel,
}: {
  open: boolean; title: string; description: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="eyebrow">Confirme a ação</span>
        <h2 id="confirm-title" className="display">{title}</h2>
        <p className="muted">{description}</p>
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onCancel}>Cancelar</button>
          <button className="button button-primary" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
