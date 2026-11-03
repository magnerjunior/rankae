import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const supabaseUrl = (__ENV.SUPABASE_URL || "").replace(/\/$/, "");
const publishableKey = __ENV.SUPABASE_PUBLISHABLE_KEY || "";
const tokens = [__ENV.ORGANIZER_TOKEN_1, __ENV.ORGANIZER_TOKEN_2, __ENV.ORGANIZER_TOKEN_3].filter(Boolean);
const matchId = __ENV.STAGING_MATCH_ID || "";

if (__ENV.TARGET_ENV !== "staging" || __ENV.ENABLE_WRITE_SCENARIO !== "true") throw new Error("Escritas exigem TARGET_ENV=staging e ENABLE_WRITE_SCENARIO=true.");
if (!supabaseUrl || !publishableKey || !matchId || tokens.length === 0) throw new Error("Configure somente credenciais temporárias e IDs do seed fictício de staging.");

export const options = { scenarios: { editors: { executor: "constant-vus", vus: Math.min(tokens.length, 3), duration: "10m" } }, thresholds: { http_req_failed: ["rate<0.01"] } };
const headersFor = (token) => ({ apikey: publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

export default function organizerWritesScenario() {
  const token = tokens[exec.vu.idInTest % tokens.length];
  const query = http.get(`${supabaseUrl}/rest/v1/matches?id=eq.${matchId}&select=revision`, { headers: headersFor(token), tags: { route: "match_revision" } });
  if (!check(query, { "revisão lida": (response) => response.status === 200 && response.json().length === 1 })) return;
  const revision = query.json()[0].revision;
  const marker = http.post(`${supabaseUrl}/rest/v1/rpc/record_match_event`, JSON.stringify({ p_match_id: matchId, p_event_type: "marker", p_side: null, p_scorer_player_id: null, p_assist_player_id: null, p_keeper_player_id: null, p_goal_kind: null, p_penalty_outcome: null, p_label: "LOAD-STAGING", p_metadata: { synthetic: true }, p_expected_revision: revision, p_idempotency_key: crypto.randomUUID() }), { headers: headersFor(token), tags: { route: "record_match_event" } });
  check(marker, { "escrita confirmada ou conflito seguro": (response) => response.status === 200 || response.status === 409 });
  sleep(5);
}
