"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const reveal = window.setTimeout(() => setOpen(localStorage.getItem("rankae-cookie-consent") !== "accepted"), 0);
    return () => window.clearTimeout(reveal);
  }, []);
  if (!open) return null;
  return <aside className="cookie-consent" aria-label="Aviso de privacidade"><p><strong>Sua privacidade importa.</strong><span>Usamos apenas dados necessários para login, segurança e funcionamento do aplicativo.</span></p><div><Link href="/legal/privacidade">Privacidade</Link><Link href="/legal/cookies">Cookies</Link><button className="button button-primary" onClick={() => { localStorage.setItem("rankae-cookie-consent", "accepted"); setOpen(false); }}>Entendi</button></div></aside>;
}
