"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeSessionRefresh({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");

  useEffect(() => {
    const supabase = createClient();
    void supabase.realtime.setAuth();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 120);
    };
    const channel = supabase
      .channel(`session:${sessionId}`, { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, refresh)
      .on("broadcast", { event: "UPDATE" }, refresh)
      .on("broadcast", { event: "DELETE" }, refresh)
      .subscribe((next) => setStatus(next === "SUBSCRIBED" ? "connected" : next === "CHANNEL_ERROR" || next === "TIMED_OUT" ? "offline" : "connecting"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, sessionId]);

  return <span className={`live-connection ${status}`} role="status"><span aria-hidden="true">●</span>{status === "connected" ? "Ao vivo" : status === "offline" ? "Reconectando" : "Conectando"}</span>;
}
