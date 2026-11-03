import http from "k6/http";
import { check, sleep } from "k6";

const profile = __ENV.LOAD_PROFILE || "baseline";
const baseUrl = (__ENV.TARGET_BASE_URL || "").replace(/\/$/, "");
const slug = __ENV.PUBLIC_RANKA_SLUG || "";

if (__ENV.TARGET_ENV !== "staging") throw new Error("TARGET_ENV=staging é obrigatório. Testes de carga não podem apontar para produção.");
if (!baseUrl || !slug) throw new Error("Defina TARGET_BASE_URL e PUBLIC_RANKA_SLUG para um seed fictício de staging.");
if (profile === "1000" && __ENV.ACK_COSTS !== "approved") throw new Error("O perfil 1000 exige ACK_COSTS=approved após confirmar quotas e custos.");

const profiles = {
  baseline: [{ duration: "1m", target: 10 }, { duration: "10m", target: 10 }, { duration: "1m", target: 0 }],
  "100": [{ duration: "2m", target: 100 }, { duration: "10m", target: 100 }, { duration: "2m", target: 0 }],
  "1000": [{ duration: "8m", target: 1000 }, { duration: "10m", target: 1000 }, { duration: "5m", target: 0 }],
};

export const options = {
  stages: profiles[profile] || profiles.baseline,
  thresholds: { http_req_failed: ["rate<0.01"], "http_req_duration{route:portal}": ["p(95)<1000"], "http_req_duration{route:health}": ["p(95)<1000"] },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function portalHttpScenario() {
  const portal = http.get(`${baseUrl}/r/${encodeURIComponent(slug)}`, { tags: { route: "portal" }, redirects: 0 });
  check(portal, { "portal responde 200": (response) => response.status === 200, "sem cache público indevido": (response) => (response.headers["Cache-Control"] || "").includes("private") });
  if (__ITER % 10 === 0) {
    const health = http.get(`${baseUrl}/api/health`, { tags: { route: "health" } });
    check(health, { "health responde 200": (response) => response.status === 200 });
  }
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  return { stdout: JSON.stringify({ profile, generatedAt: new Date().toISOString(), metrics: data.metrics }, null, 2), [`artifacts/load-http-${profile}.json`]: JSON.stringify(data, null, 2) };
}
