"use client";

import { useState } from "react";
import Link from "next/link";
import { InstallAppButton } from "@/components/install-app-button";
import { rankaSections, type RankaSection } from "@/lib/navigation";

const bottomKeys: RankaSection[] = [
  "inicio",
  "jogo",
  "contribuicoes",
  "estatisticas",
  "configuracoes",
];

function sectionHref(key: RankaSection, rankaId: string) {
  return key === "inicio"
    ? `/app/rankas/${rankaId}`
    : `/app/rankas/${rankaId}/${key}`;
}

export function BottomNav({
  active,
  rankaId,
}: {
  active: RankaSection;
  rankaId: string;
}) {
  return (
    <nav className="bottom-nav" aria-label="Atalhos do ranka">
      {bottomKeys.map((key) => {
        const item = rankaSections.find((section) => section.key === key)!;
        return (
          <Link
            key={key}
            className={`bottom-link ${active === key ? "active" : ""}`}
            href={sectionHref(key, rankaId)}
            aria-current={active === key ? "page" : undefined}
          >
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  active,
  children,
  rankaId = "demo",
  title = "Ranka do Parque",
  gameStatus,
}: {
  active: RankaSection;
  children: React.ReactNode;
  rankaId?: string;
  title?: string;
  demo?: boolean;
  gameStatus?: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="topbar glass-bar">
          <button
            className="menu-trigger"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-title">
            <strong>{title}</strong>
            <span>
              {rankaSections.find((section) => section.key === active)?.label}
            </span>
          </div>
          <Link
            className="brand brand-compact topbar-brand"
            href="/app"
            aria-label="Meus rankas"
          >
            <span className="brand-mark">R</span>
          </Link>
        </header>
        {gameStatus}
        <main className="page">{children}</main>
        <BottomNav active={active} rankaId={rankaId} />
      </div>
      {menuOpen && (
        <div
          className="menu-backdrop"
          role="presentation"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="menu-drawer glass-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do ranka"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="between">
              <span className="brand">
                <span className="brand-mark">R</span>
                <span className="brand-name">Rankaê</span>
              </span>
              <button
                className="menu-close"
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
              >
                ×
              </button>
            </div>
            <nav className="drawer-nav">
              {rankaSections
                .filter(
                  (item) =>
                    !["jogadores", "chegada", "times", "partida"].includes(
                      item.key,
                    ),
                )
                .map((item) => (
                  <Link
                    key={item.key}
                    href={sectionHref(item.key, rankaId)}
                    className={active === item.key ? "active" : ""}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
            </nav>
            <div className="drawer-secondary">
              <InstallAppButton />
              <Link href="/app" onClick={() => setMenuOpen(false)}>
                Trocar de ranka
              </Link>
              <Link href="/app/privacidade">Privacidade</Link>
              <Link href="/app/legal">Documentos</Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
