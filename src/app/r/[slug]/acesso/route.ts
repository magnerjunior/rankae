import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PublicPortalRepository } from "@/data/supabase/public-portal-repository";
import { createClient } from "@/lib/supabase/server";
import { portalCookieName, portalFingerprint } from "@/server/public-portal";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const accessSchema = z.object({ linkToken: z.string().min(32).optional(), pin: z.string().regex(/^\d{4}$/).optional() });

async function exchange(request: NextRequest, slug: string, input: z.infer<typeof accessSchema>) {
  const grantToken = randomBytes(32).toString("base64url");
  const repository = new PublicPortalRepository(await createClient());
  const result = await repository.exchange({ slug, linkToken: input.linkToken, pin: input.pin, grantToken, fingerprint: portalFingerprint(request) });
  const redirectUrl = new URL(`/r/${slug}`, request.url);
  if (!result.authorized) {
    redirectUrl.searchParams.set("acesso", result.status === "locked" ? "bloqueado" : "invalido");
    if (input.linkToken) redirectUrl.searchParams.set("token", input.linkToken);
    return NextResponse.redirect(redirectUrl, 303);
  }
  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set(portalCookieName(slug), grantToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/r/${slug}`, maxAge: 60 * 60 * 2 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsedSlug = slugSchema.safeParse((await params).slug);
  const parsed = accessSchema.safeParse({ linkToken: request.nextUrl.searchParams.get("token") || undefined });
  if (!parsedSlug.success || !parsed.success || !parsed.data.linkToken) return NextResponse.redirect(new URL("/", request.url), 303);
  return exchange(request, parsedSlug.data, parsed.data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsedSlug = slugSchema.safeParse((await params).slug);
  const form = await request.formData();
  const parsed = accessSchema.safeParse({ linkToken: form.get("linkToken") || undefined, pin: form.get("pin") || undefined });
  if (!parsedSlug.success || !parsed.success) return NextResponse.redirect(new URL("/", request.url), 303);
  return exchange(request, parsedSlug.data, parsed.data);
}

