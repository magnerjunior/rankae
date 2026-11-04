"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const resolutionSchema = z.object({ incidentId: z.string().uuid(), reason: z.string().trim().min(8).max(500) });
const planSchema = z.object({
  monthlyPrice: z.coerce.number().min(1).max(100000),
  compareAtPrice: z.union([z.literal(""), z.coerce.number().min(1).max(100000)]),
  extraRankaPrice: z.coerce.number().min(1).max(100000),
  annualPrice: z.union([z.literal(""), z.coerce.number().min(1).max(1000000)]),
  trialDays: z.coerce.number().int().min(0).max(90),
  reason: z.string().trim().min(8).max(500),
});

export async function resolveIncidentAction(formData: FormData) {
  await requireUserId();
  const parsed = resolutionSchema.safeParse({ incidentId: formData.get("incidentId"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/app/admin?erro=resolucao");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_incident", { p_incident_id: parsed.data.incidentId, p_reason: parsed.data.reason });
  if (error) redirect("/app/admin?erro=permissao");
  revalidatePath("/app/admin");
  redirect("/app/admin?sucesso=resolvido");
}

export async function updateCommercialPlanAction(formData: FormData) {
  await requireUserId();
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
  const supabase = await createClient();
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
