"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const resolutionSchema = z.object({ incidentId: z.string().uuid(), reason: z.string().trim().min(8).max(500) });

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
