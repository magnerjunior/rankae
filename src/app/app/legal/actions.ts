"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/server/auth";

const acceptanceSchema = z.object({ documentId: z.string().uuid(), version: z.coerce.number().int().positive() });

export async function acceptLegalDocumentAction(formData: FormData) {
  await requireUserId({ allowPendingLegal: true });
  const parsed = acceptanceSchema.safeParse({ documentId: formData.get("documentId"), version: formData.get("version") });
  if (!parsed.success) redirect("/app/legal?erro=dados");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_legal_document", {
    p_document_id: parsed.data.documentId,
    p_expected_version: parsed.data.version,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) redirect("/app/legal?erro=aceite");
  redirect("/app/legal?sucesso=aceite");
}
