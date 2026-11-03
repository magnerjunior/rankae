"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function RealtimeSessionRefresh({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | undefined;
    let disposed = false;
    const connectionTimeout = window.setTimeout(() => {
      if (!disposed) setStatus("offline");
    }, 8_000);
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 120);
    };

    async function connect() {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel = supabase
        .channel(`session:${sessionId}`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, refresh)
        .on("broadcast", { event: "UPDATE" }, refresh)
        .on("broadcast", { event: "DELETE" }, refresh)
        .subscribe((next) => {
          if (next === "SUBSCRIBED") {
            window.clearTimeout(connectionTimeout);
            setStatus("connected");
          } else if (next === "CHANNEL_ERROR" || next === "TIMED_OUT" || next === "CLOSED") {
            setStatus("offline");
          } else {
            setStatus("connecting");
          }
        });
    }

    void connect().catch(() => setStatus("offline"));
    return () => {
      disposed = true;
      window.clearTimeout(connectionTimeout);
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, sessionId]);

  return <span className={`live-connection ${status}`} role="status"><span aria-hidden="true">●</span>{status === "connected" ? "Ao vivo" : status === "offline" ? "Reconectando" : "Conectando"}</span>;
}
