import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

export function portalCookieName(slug: string) {
  return `rankae_portal_${slug.replace(/[^a-z0-9-]/g, "").slice(0, 48)}`;
}

export function portalFingerprint(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  const agent = request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${address}|${agent}`).digest("hex");
}

