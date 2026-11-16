"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function supportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function vapidBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
}

export function MatchPushSettings({ rankaId }: { rankaId: string }) {
  const [status, setStatus] = useState<"loading" | "off" | "on" | "unsupported">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function read() {
      if (!supportsPush()) return "unsupported";
      if (Notification.permission !== "granted") return "off";
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return "off";
      const { data } = await createClient().rpc("has_match_push_device", { p_ranka_id: rankaId, p_endpoint: subscription.endpoint });
      return data === true ? "on" : "off";
    }
    void read().then((next) => { if (!cancelled) setStatus(next); }).catch(() => { if (!cancelled) setStatus("off"); });
    return () => { cancelled = true; };
  }, [rankaId]);

  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      // Request permission directly from the user's tap.
      if (status !== "on" && await Notification.requestPermission() !== "granted") {
        setMessage("Permita notificações nas configurações do navegador e tente de novo.");
        return;
      }
      const supabase = createClient();
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) {
        setMessage("Atualize a página para ativar os avisos neste aparelho.");
        return;
      }
      let subscription = await registration.pushManager.getSubscription();
      if (status === "on") {
        if (subscription) {
          const { error } = await supabase.rpc("set_match_push_device", { p_ranka_id: rankaId, p_endpoint: subscription.endpoint, p_p256dh: null, p_auth: null });
          if (error) throw error;
        }
        setStatus("off");
        return;
      }
      const { data: key, error: configError } = await supabase.rpc("get_match_push_key");
      if (configError || typeof key !== "string" || !key) {
        setMessage("Os avisos ainda não estão disponíveis neste ambiente.");
        return;
      }
      const applicationServerKey = vapidBytes(key);
      if (subscription?.options.applicationServerKey && new Uint8Array(subscription.options.applicationServerKey).toString() !== applicationServerKey.toString()) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const { error } = await supabase.rpc("set_match_push_device", { p_ranka_id: rankaId, p_endpoint: subscription.endpoint, p_p256dh: subscription.toJSON().keys?.p256dh, p_auth: subscription.toJSON().keys?.auth });
      if (error) throw error;
      setStatus("on");
      setMessage("Avisos ativados neste aparelho.");
    } catch {
      setMessage("Não foi possível alterar os avisos. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel kit-settings">
    <h2 className="panel-title display">Avisos da partida</h2>
    <p className="muted">Receba o placar e o aviso de fim de partida com a tela bloqueada.</p>
    {status === "unsupported" ? <p className="muted">Use um navegador compatível. No iPhone, adicione o Rankaê à tela de início e abra o app por lá.</p>
      : <button type="button" className="button button-secondary" disabled={busy || status === "loading"} onClick={toggle}>
        {status === "on" ? "Desativar avisos neste aparelho" : "Ativar avisos neste aparelho"}
      </button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
