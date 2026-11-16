import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import webPush from "npm:web-push@3.6.7";

type Device = { endpoint: string; p256dh: string; auth: string };
type Match = {
  id: string;
  rankaId: string;
  revision: number;
  ordinal: number;
  state: string;
  startedAt?: string;
  durationMs: number;
  elapsedMs: number;
  yellow: number;
  red: number;
  devices: Device[];
};

function makePayload(match: Match) {
  const overtime = match.state.startsWith("overtime");
  const running = match.state === "live" || match.state === "overtime_live";
  const ended = match.state === "completed" || match.state === "tie_break";
  const elapsed = match.elapsedMs + (running && match.startedAt ? Math.max(0, Date.now() - Date.parse(match.startedAt)) : 0);
  const seconds = Math.ceil(Math.max(0, match.durationMs - elapsed) / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const title = match.state === "completed" ? "Fim de partida"
    : match.state === "tie_break" ? "Tempo encerrado · desempate"
      : overtime ? "Prorrogação" : running ? "Jogo em andamento" : "Cronômetro pausado";
  return JSON.stringify({
    title,
    body: `Jogo ${match.ordinal} · ${match.yellow} × ${match.red}${ended ? "" : ` · ${time} no envio`}`,
    tag: `ranka-${match.rankaId}`,
    url: `/app/rankas/${match.rankaId}/jogo?etapa=partida`,
    alert: ended,
  });
}

Deno.serve(async (request) => {
  const token = request.headers.get("x-ranka-worker");
  if (request.method !== "POST" || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return new Response(null, { status: 403 });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("claim_match_push", { p_token: token });
  if (error) return new Response(null, { status: error.code === "42501" ? 403 : 503 });
  if (!data) return new Response(null, { status: 204 });
  const batch = data as { publicKey: string; privateKey: string; matches: Match[] };
  const vapidDetails = { subject: "https://rankae.vercel.app", publicKey: batch.publicKey, privateKey: batch.privateKey };
  await Promise.all(batch.matches.map(async (match) => {
    const expired: string[] = [];
    const body = makePayload(match);
    const uniqueDevices = new Map(match.devices.map((device) => [device.endpoint, device]));
    await Promise.all([...uniqueDevices.values()].map(async ({ endpoint, p256dh, auth }) => {
      try {
        await webPush.sendNotification({ endpoint, keys: { p256dh, auth } }, body, {
          vapidDetails, TTL: 120, urgency: match.state === "completed" || match.state === "tie_break" ? "high" : "normal",
          timeout: 7000,
        });
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(endpoint);
      }
    }));
    await supabase.rpc("ack_match_push", { p_match_id: match.id, p_revision: match.revision, p_expired: expired });
  }));
  return new Response(null, { status: 204 });
});
