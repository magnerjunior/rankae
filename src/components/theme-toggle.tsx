"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDark(document.documentElement.dataset.theme === "dark"));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <button className="button button-secondary" type="button" aria-pressed={dark} onClick={() => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(!dark);
    try { localStorage.setItem("rankae:theme", next); } catch { /* The current tab still switches. */ }
  }}>Modo escuro</button>;
}
