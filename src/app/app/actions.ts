"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const createRankaSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
});

function slugify(value: string) {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "ranka";
  return `${base}-${randomUUID().slice(0, 4)}`;
}

export async function createRankaAction(formData: FormData) {
  await requireUserId();
  const parsed = createRankaSchema.safeParse({ orgId: formData.get("orgId"), name: formData.get("name") });
  if (!parsed.success) redirect("/app?erro=novo-ranka");
  const supabase = await createClient();
  const { count } = await supabase.from("rankas").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 3) redirect("/app?erro=limite-ou-dados");
  let { data, error } = await supabase.rpc("create_additional_ranka", {
    p_org_id: parsed.data.orgId,
    p_ranka_name: parsed.data.name,
    p_ranka_slug: slugify(parsed.data.name),
  });
  if (error?.code === "PGRST202") {
    const { data: organization } = await supabase.from("organizations").select("name").eq("id", parsed.data.orgId).single();
    const fallback = await supabase.rpc("create_ranka_workspace", {
      p_organization_name: organization?.name ?? "Meus rankas",
      p_ranka_name: parsed.data.name,
      p_ranka_slug: slugify(parsed.data.name),
    });
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data || typeof data !== "object" || !("ranka_id" in data)) redirect("/app?erro=limite-ou-dados");
  revalidatePath("/app");
  redirect(`/app/rankas/${String(data.ranka_id)}`);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
