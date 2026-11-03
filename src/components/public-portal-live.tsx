"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PublicPortalLive({ slug }: { slug: string }) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => router.refresh(), 150);
    };
    const channel = supabase.channel(`portal:${slug}`, { config: { private: false } })
      .on("broadcast", { event: "refresh" }, refresh)
      .subscribe((next) => setStatus(next === "SUBSCRIBED" ? "connected" : next === "CHANNEL_ERROR" || next === "TIMED_OUT" ? "offline" : "connecting"));
    const poll = setInterval(refresh, 15_000);
    const onOnline = () => { setStatus("connecting"); refresh(); };
    const onOffline = () => setStatus("offline");
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router, slug]);
  return <span className={`live-connection ${status}`} role="status"><span aria-hidden="true">●</span>{status === "connected" ? "Ao vivo" : status === "offline" ? "Sem conexão · tentando novamente" : "Conectando"}</span>;
}

