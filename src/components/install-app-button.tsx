"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent>();
  useEffect(() => {
    const receive = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", receive);
    return () => window.removeEventListener("beforeinstallprompt", receive);
  }, []);
  if (!prompt) return null;
  return <button className="install-app-button" type="button" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(undefined); }}>Instalar aplicativo</button>;
}
