"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { adminAuthConfigured, createAdminAuthClient } from "@/lib/supabase/admin-auth";
import { siteUrl } from "@/lib/site-url";

const resolutionSchema = z.object({ incidentId: z.string().uuid(), reason: z.string().trim().min(8).max(500) });
const reasonSchema = z.string().trim().min(8).max(500);

export async function inviteOrganizerAction(formData: FormData) {
  const client = await requirePlatformAdmin();
  const email = z.email().max(254).safeParse(formData.get("email"));
  if (!email.success || !adminAuthConfigured()) redirect("/admin?erro=convite");
  const { error: auditError } = await client.rpc("admin_audit_organizer_invite");
  if (auditError) redirect("/admin?erro=convite");
  const { error } = await createAdminAuthClient().auth.admin.inviteUserByEmail(email.data.toLowerCase(), {
    redirectTo: new URL("/auth/callback", siteUrl).href,
  });
  if (error) redirect("/admin?erro=convite");
  revalidatePath("/admin");
  redirect("/admin?sucesso=convite");
}

export async function grantTrialAction(formData: FormData) {
  const client = await requirePlatformAdmin();
  const parsed = z.object({ userId: z.uuid(), limit: z.coerce.number().int().min(1).max(100), days: z.coerce.number().int().min(1).max(365), reason: reasonSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin?erro=teste");
  const { userId, limit, days, reason } = parsed.data;
  const { error } = await client.rpc("admin_grant_ranka_trial", { p_user_id: userId, p_limit: limit, p_days: days, p_reason: reason });
  if (error) redirect("/admin?erro=teste");
  revalidatePath("/admin");
  redirect("/admin?sucesso=teste");
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
