"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { adminAuthConfigured, createAdminAuthClient } from "@/lib/supabase/admin-auth";
import { siteUrl } from "@/lib/site-url";

const resolutionSchema = z.object({ incidentId: z.string().uuid(), reason: z.string().trim().min(8).max(500) });
const reasonSchema = z.string().trim().min(8).max(500);
const accessFieldsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mode: z.enum(["trial", "active"]),
  rankaLimit: z.coerce.number().int().min(1).max(100),
  paying: z.literal("on").optional(),
  sessionLimit: z.coerce.number().int().min(1).max(100).optional(),
  trialDays: z.coerce.number().int().min(1).max(365).optional(),
}).refine((fields) => fields.mode === "active" || (fields.sessionLimit !== undefined && fields.trialDays !== undefined));

function accountAccessArgs(userId: string, fields: z.infer<typeof accessFieldsSchema>) {
  const trial = fields.mode === "trial";
  return { p_user_id: userId, p_name: fields.name, p_mode: fields.mode, p_ranka_limit: fields.rankaLimit,
    p_paying: !trial && fields.paying === "on", p_session_limit: trial ? fields.sessionLimit : null, p_trial_days: trial ? fields.trialDays : null };
}

export async function inviteOrganizerAction(_previous: { link?: string; error?: string }, formData: FormData): Promise<{ link?: string; error?: string }> {
  const client = await requirePlatformAdmin();
  const email = z.email().max(254).safeParse(formData.get("email"));
  const access = accessFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!email.success || !access.success || !adminAuthConfigured()) return { error: "Confira os dados da conta e a configuração de convites." };
  const { error: auditError } = await client.rpc("admin_audit_organizer_invite");
  if (auditError) return { error: "Não foi possível autorizar o convite." };
  const { data, error } = await createAdminAuthClient().auth.admin.generateLink({
    type: "invite",
    email: email.data.toLowerCase(),
  });
  if (error || !data?.properties.hashed_token || !data.user.id) return { error: "Não foi possível gerar o convite. Confira se esse e-mail já tem conta." };
  const { error: accessError } = await client.rpc("admin_configure_account", accountAccessArgs(data.user.id, access.data));
  if (accessError) return { error: "O convite ficou sem configuração de acesso. Confira a conta em Contas e testes antes de enviar o acesso." };
  const link = new URL("/auth/callback", siteUrl);
  link.searchParams.set("type", "invite");
  link.searchParams.set("token_hash", data.properties.hashed_token);
  revalidatePath("/admin");
  return { link: link.href };
}

export async function updateAccountAccessAction(userId: string, formData: FormData) {
  const client = await requirePlatformAdmin();
  if (!z.uuid().safeParse(userId).success) redirect("/admin?erro=conta");
  const path = `/admin/contas/${userId}`;
  const parsed = accessFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${path}?erro=1`);
  const { error } = await client.rpc("admin_configure_account", accountAccessArgs(userId, parsed.data));
  if (error) redirect(`${path}?erro=1`);
  revalidatePath("/admin");
  revalidatePath(path);
  redirect(`${path}?sucesso=1`);
}

export async function updateTeamLimitAction(userId: string, orgId: string, formData: FormData) {
  const client = await requirePlatformAdmin();
  const parsed = z.object({ userId: z.uuid(), orgId: z.uuid(), limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(50)) }).safeParse({ userId, orgId, limit: formData.get("limit") });
  if (!parsed.success) redirect("/admin?erro=limite");
  const path = `/admin/contas/${userId}`;
  const { error } = await client.rpc("admin_set_team_limit", { p_org_id: parsed.data.orgId, p_limit: parsed.data.limit });
  if (error) redirect(`${path}?erro=${error.code === "PT409" ? "vagas" : "limite"}#equipe`);
  revalidatePath(path);
  redirect(`${path}?sucesso=equipe#equipe`);
}

export async function recordReceiptAction(formData: FormData) {
  const client = await requirePlatformAdmin();
  const parsed = z.object({ userId: z.uuid(), amount: z.coerce.number().min(.01).max(1000000), receivedOn: z.iso.date(), reference: reasonSchema, requestId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin?erro=recebimento");
  const { userId, amount, receivedOn, reference, requestId } = parsed.data;
  const { error } = await client.rpc("admin_record_receipt", { p_user_id: userId, p_amount_cents: Math.round(amount * 100), p_received_on: receivedOn, p_reference: reference, p_request_id: requestId });
  if (error) redirect("/admin?erro=recebimento");
  revalidatePath("/admin");
  redirect("/admin?sucesso=recebimento");
}
const planSchema = z.object({
  monthlyPrice: z.coerce.number().min(1).max(100000),
  compareAtPrice: z.union([z.literal(""), z.coerce.number().min(1).max(100000)]),
  extraRankaPrice: z.coerce.number().min(1).max(100000),
  annualPrice: z.union([z.literal(""), z.coerce.number().min(1).max(1000000)]),
  trialDays: z.coerce.number().int().min(0).max(90),
  reason: z.string().trim().min(8).max(500),
});

export async function resolveIncidentAction(formData: FormData) {
  const supabase = await requirePlatformAdmin();
  const parsed = resolutionSchema.safeParse({ incidentId: formData.get("incidentId"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin?erro=resolucao");
  const { error } = await supabase.rpc("admin_resolve_incident", { p_incident_id: parsed.data.incidentId, p_reason: parsed.data.reason });
  if (error) redirect("/admin?erro=permissao");
  revalidatePath("/admin");
  redirect("/admin?sucesso=resolvido");
}

export async function updateCommercialPlanAction(formData: FormData) {
  const supabase = await requirePlatformAdmin();
  const parsed = planSchema.safeParse({
    monthlyPrice: formData.get("monthlyPrice"),
    compareAtPrice: formData.get("compareAtPrice"),
    extraRankaPrice: formData.get("extraRankaPrice"),
    annualPrice: formData.get("annualPrice"),
    trialDays: formData.get("trialDays"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/admin?erro=plano");
  const toCents = (value: number) => Math.round(value * 100);
  const { error } = await supabase.rpc("admin_update_commercial_plan", {
    p_monthly_price_cents: toCents(parsed.data.monthlyPrice),
    p_compare_at_price_cents: parsed.data.compareAtPrice === "" ? null : toCents(parsed.data.compareAtPrice),
    p_extra_ranka_price_cents: toCents(parsed.data.extraRankaPrice),
    p_annual_price_cents: parsed.data.annualPrice === "" ? null : toCents(parsed.data.annualPrice),
    p_trial_days: parsed.data.trialDays,
    p_reason: parsed.data.reason,
  });
  if (error) redirect("/admin?erro=permissao");
  revalidatePath("/");
  revalidatePath("/app");
  revalidatePath("/admin");
  redirect("/admin?sucesso=plano");
}
