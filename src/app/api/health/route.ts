import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { operationalLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("platform_health_check");
    if (error) throw error;
    const durationMs = Math.round(performance.now() - started);
    operationalLog("info", { event: "health_check", requestId, route: "/api/health", durationMs, status: 200 });
    return NextResponse.json({ ...data, requestId, durationMs }, { status: 200, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  } catch {
    const durationMs = Math.round(performance.now() - started);
    operationalLog("error", { event: "health_check_failed", requestId, route: "/api/health", durationMs, status: 503, detail: "database_unavailable" });
    return NextResponse.json({ status: "degraded", database: "unavailable", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}
