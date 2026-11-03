"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(100),
  rankaName: z.string().trim().min(2).max(100),
  rankaSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function createWorkspaceAction(formData: FormData) {
  await requireUserId();
  const parsed = onboardingSchema.safeParse({ organizationName: formData.get("organizationName"), rankaName: formData.get("rankaName"), rankaSlug: formData.get("rankaSlug") });
  if (!parsed.success) redirect("/app/configurar?erro=dados");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_ranka_workspace", { p_organization_name: parsed.data.organizationName, p_ranka_name: parsed.data.rankaName, p_ranka_slug: parsed.data.rankaSlug });
  if (error || !data || typeof data !== "object" || !("ranka_id" in data)) redirect("/app/configurar?erro=salvar");
  redirect(`/app/rankas/${String(data.ranka_id)}`);
}
