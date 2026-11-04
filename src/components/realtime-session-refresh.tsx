"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function RealtimeSessionRefresh({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | undefined;
    let disposed = false;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 600);
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
          if (next === "CHANNEL_ERROR" || next === "TIMED_OUT") {
            // O cliente do Supabase tenta reconectar. A interface continua utilizável
            // e as próprias ações confirmam seus resultados, sem um aviso permanente.
          }
        });
    }

    void connect().catch(() => undefined);
    return () => {
      disposed = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, sessionId]);

  return null;
}
