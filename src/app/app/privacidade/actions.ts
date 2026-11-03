"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const requestSchema = z.object({
  orgId: z.string().uuid(),
  playerId: z.preprocess((value) => value === "" ? null : value, z.string().uuid().nullable()),
  requestType: z.enum(["access", "correction", "deletion", "public_withdrawal"]),
  description: z.string().trim().min(10).max(1200),
});

export async function createPrivacyRequestAction(formData: FormData) {
  await requireUserId();
  const parsed = requestSchema.safeParse({ orgId: formData.get("orgId"), playerId: formData.get("playerId"), requestType: formData.get("requestType"), description: formData.get("description") });
  if (!parsed.success) redirect("/app/privacidade?erro=dados");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_privacy_request", {
    p_org_id: parsed.data.orgId,
    p_player_id: parsed.data.playerId,
    p_request_type: parsed.data.requestType,
    p_description: parsed.data.description,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) redirect(`/app/privacidade?org=${parsed.data.orgId}&erro=salvar`);
  revalidatePath("/app/privacidade");
  redirect(`/app/privacidade?org=${parsed.data.orgId}&sucesso=protocolo`);
}

const resolutionSchema = z.object({
  requestId: z.string().uuid(),
  orgId: z.string().uuid(),
  status: z.enum(["completed", "rejected"]),
  note: z.string().trim().min(10).max(1200),
  replacementName: z.string().trim().max(120).optional(),
});

export async function resolvePrivacyRequestAction(formData: FormData) {
  await requireUserId();
  const parsed = resolutionSchema.safeParse({ requestId: formData.get("requestId"), orgId: formData.get("orgId"), status: formData.get("status"), note: formData.get("note"), replacementName: formData.get("replacementName") || undefined });
  if (!parsed.success) redirect("/app/privacidade?erro=resolucao");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_privacy_request", {
    p_request_id: parsed.data.requestId,
    p_resolution_status: parsed.data.status,
    p_resolution_note: parsed.data.note,
    p_replacement_name: parsed.data.replacementName ?? null,
  });
  if (error) redirect(`/app/privacidade?org=${parsed.data.orgId}&erro=resolucao`);
  revalidatePath("/app/privacidade");
  redirect(`/app/privacidade?org=${parsed.data.orgId}&sucesso=resolvido`);
}
