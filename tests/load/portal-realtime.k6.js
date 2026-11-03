import ws from "k6/ws";
import { check } from "k6";

const profile = __ENV.LOAD_PROFILE || "baseline";
const supabaseUrl = (__ENV.SUPABASE_URL || "").replace(/\/$/, "");
const publishableKey = __ENV.SUPABASE_PUBLISHABLE_KEY || "";
const slug = __ENV.PUBLIC_RANKA_SLUG || "";

if (__ENV.TARGET_ENV !== "staging") throw new Error("TARGET_ENV=staging é obrigatório para realtime.");
if (!supabaseUrl || !publishableKey || !slug) throw new Error("Defina SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e PUBLIC_RANKA_SLUG de staging.");
if (profile === "1000" && __ENV.ACK_COSTS !== "approved") throw new Error("O perfil 1000 exige ACK_COSTS=approved.");

const vus = profile === "1000" ? 1000 : profile === "100" ? 100 : 10;
export const options = { scenarios: { realtime: { executor: "constant-vus", vus, duration: "10m", gracefulStop: "20s" } }, thresholds: { checks: ["rate>0.99"] } };

export default function portalRealtimeScenario() {
  const socketUrl = `${supabaseUrl.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(publishableKey)}&vsn=1.0.0`;
  const response = ws.connect(socketUrl, { headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` } }, (socket) => {
    let joined = false;
    let reference = 1;
    socket.on("open", () => {
      socket.send(JSON.stringify({ topic: `realtime:portal:${slug}`, event: "phx_join", payload: { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, postgres_changes: [] }, access_token: publishableKey }, ref: String(reference++) }));
      socket.setInterval(() => socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(reference++) })), 25000);
      socket.setTimeout(() => socket.close(), 55000);
    });
    socket.on("message", (raw) => { const message = JSON.parse(raw); if (message.event === "phx_reply" && message.payload?.status === "ok") joined = true; });
    socket.on("close", () => check(joined, { "canal realtime inscrito": (value) => value === true }));
  });
  check(response, { "websocket aceito": (result) => result && result.status === 101 });
}
