import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { z } from "npm:zod@4.6.7";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const schema = z.object({ operation: z.literal("organizer"), email, name: z.string().trim().min(2).max(100), mode: z.enum(["active", "trial"]),
  rankaLimit: z.number().int().min(1).max(100), paying: z.boolean(), sessionLimit: z.number().int().min(1).max(100).optional(), trialDays: z.number().int().min(1).max(365).optional() });
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const respond = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (status: number, code: string) => respond(status, { code });

function key(dictionary: string, fallback: string) {
  const keys = Deno.env.get(dictionary);
  return (keys ? z.record(z.string(), z.string()).parse(JSON.parse(keys)).default : undefined) ?? Deno.env.get(fallback);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return fail(405, "method");
  const authorization = request.headers.get("Authorization");
  const jwt = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!authorization || !jwt) return fail(401, "forbidden");
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "invalid");
    const decoder = new TextDecoder();
    let body = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); return fail(413, "invalid"); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    let json: unknown;
    try { json = JSON.parse(body); } catch { return fail(400, "invalid"); }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return fail(400, "invalid");
    const input = parsed.data;
    const url = Deno.env.get("SUPABASE_URL");
    const secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const publishable = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!url || !secret || !publishable) return fail(503, "unavailable");
    const userClient = createClient(url, publishable, { ...options, global: { headers: { Authorization: authorization } } });
    const verified = await userClient.auth.getUser(jwt);
    if (verified.error || !verified.data.user) return fail(401, "forbidden");
    const trial = input.mode === "trial";
    if (trial && (input.sessionLimit === undefined || input.trialDays === undefined)) return fail(400, "invalid");
    const audit = await userClient.rpc("admin_audit_organizer_invite");
    if (audit.error) return fail(audit.error.code === "42501" ? 403 : 503, audit.error.code === "42501" ? "forbidden" : "unavailable");
    const admin = createClient(url, secret, options);
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: input.email });
    if (error) return ["email_exists", "user_already_exists"].includes(error.code ?? "") ? fail(409, "exists") : fail(502, "auth");
    if (!data?.properties.hashed_token || !data.user.id) return fail(502, "auth");
    const { error: configurationError } = await userClient.rpc("admin_configure_account", {
      p_user_id: data.user.id, p_name: input.name, p_mode: input.mode, p_ranka_limit: input.rankaLimit,
      p_paying: !trial && input.paying, p_session_limit: trial ? input.sessionLimit : null, p_trial_days: trial ? input.trialDays : null,
    });
    if (configurationError) return fail(502, "configuration");
    return respond(200, { tokenHash: data.properties.hashed_token });
  } catch {
    return fail(503, "unavailable");
  }
});
