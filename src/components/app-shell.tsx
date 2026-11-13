"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InstallAppButton } from "@/components/install-app-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { rankaSections, type RankaSection } from "@/lib/navigation";

const bottomKeys: RankaSection[] = [
  "inicio",
  "jogadores",
  "jogo",
  "contribuicoes",
  "estatisticas",
];
const prefetchableSections: RankaSection[] = [...bottomKeys, "configuracoes"];
const recentSectionKey = "rankae:recent-section:v1";
const tabIcons: Partial<Record<RankaSection, string>> = {
  inicio: "M3 10l9-7 9 7v10h-6v-6H9v6H3z",
  jogadores: "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm4-4a4 4 0 0 1 0 8",
  jogo: "M4 5h16v14H4zM12 5v14m3-7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  contribuicoes: "M3 6h18v12H3zM3 10h18m-14 4h3",
  estatisticas: "M4 20h16M7 16v-5m5 5V6m5 10V9",
};

function sectionHref(key: RankaSection, rankaId: string) {
  return key === "inicio"
    ? `/app/rankas/${rankaId}`
    : `/app/rankas/${rankaId}/${key}`;
}

export function BottomNav({
  active,
  rankaId,
  warmSection,
  onIntent,
}: {
  active: RankaSection;
  rankaId: string;
  warmSection?: RankaSection;
  onIntent?: (section: RankaSection) => void;
}) {
  const selected = active === "chegada" || active === "times" || active === "partida" ? "jogo" : active;
  return (
    <nav className="bottom-nav" aria-label="Atalhos do ranka">
      {bottomKeys.map((key) => {
        const item = rankaSections.find((section) => section.key === key)!;
        return (
          <Link
            key={key}
            className={`bottom-link ${key === "jogo" ? "game-tab" : ""} ${selected === key ? "active" : ""}`}
            href={sectionHref(key, rankaId)}
            prefetch={key === warmSection ? true : undefined}
            onMouseEnter={() => onIntent?.(key)}
            onFocus={() => onIntent?.(key)}
            aria-current={selected === key ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={tabIcons[key]} /></svg>
            <span>{key === "jogadores" ? "Jogadores" : item.short}</span>
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
  gameNeedsFreshData = false,
}: {
  active: RankaSection;
  children: React.ReactNode;
  rankaId?: string;
  title?: string;
  demo?: boolean;
  gameStatus?: React.ReactNode;
  gameNeedsFreshData?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [predictedSection, setPredictedSection] = useState<{ from: string; to: RankaSection }>();
  const [intendedSection, setIntendedSection] = useState<{ from: string; to: RankaSection }>();
  const current = sectionHref(active, rankaId);

  useEffect(() => {
    if (rankaId === "demo") return;
    // Yield to the current screen, and warm only one destination in the background.
    const timer = window.setTimeout(() => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (!navigator.onLine || connection?.saveData || connection?.effectiveType?.endsWith("2g")) return;
      let recent: string | null = null;
      try {
        recent = localStorage.getItem(recentSectionKey);
        if (active !== "inicio" && prefetchableSections.includes(active)) {
          localStorage.setItem(recentSectionKey, active);
        }
      } catch {
        // Storage can be unavailable in private browsing or managed environments.
      }
      const fallback = active !== "inicio" ? "inicio" : gameNeedsFreshData ? "jogadores" : "jogo";
      const destination = prefetchableSections.find((key) => key === recent && key !== active && (key !== "jogo" || !gameNeedsFreshData));
      setPredictedSection({ from: current, to: destination ?? fallback });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [active, current, gameNeedsFreshData, rankaId]);

  const candidate = intendedSection?.from === current ? intendedSection.to : predictedSection?.from === current ? predictedSection.to : undefined;
  const warmSection = candidate === active || (candidate === "jogo" && gameNeedsFreshData) ? undefined : candidate;
  const onIntent = (section: RankaSection) => {
    if (rankaId !== "demo" && section !== active && (section !== "jogo" || !gameNeedsFreshData)) {
      setIntendedSection({ from: current, to: section });
    }
  };
  return (
    <div className="app-shell">
      <div className="app-main" inert={menuOpen}>
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
            className={`topbar-players ${active === "jogadores" ? "active" : ""}`}
            href={sectionHref("jogadores", rankaId)}
            prefetch={warmSection === "jogadores" ? true : undefined}
            onMouseEnter={() => onIntent("jogadores")}
            onFocus={() => onIntent("jogadores")}
            aria-current={active === "jogadores" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={tabIcons.jogadores} /></svg>
            <span>Jogadores</span>
          </Link>
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
        <BottomNav active={active} rankaId={rankaId} warmSection={warmSection} onIntent={onIntent} />
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
            onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}
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
                autoFocus
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
                    prefetch={warmSection === item.key ? true : undefined}
                    onMouseEnter={() => onIntent(item.key)}
                    onFocus={() => onIntent(item.key)}
                    className={active === item.key ? "active" : ""}
                    aria-current={active === item.key ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
            </nav>
            <div className="drawer-secondary">
              <ThemeToggle />
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
