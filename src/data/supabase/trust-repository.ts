import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { commercialPlanSchema } from "@/lib/commercial";

const legalDocumentSchema = z.object({
  id: z.string().uuid(), key: z.string(), version: z.number().int().positive(), title: z.string(), body: z.string(), effectiveAt: z.string(),
});

const privacyRequestSchema = z.object({
  id: z.string().uuid(), requestType: z.string(), status: z.string(), description: z.string(), resolutionNote: z.string().nullish(),
  playerId: z.string().uuid().nullish(), createdAt: z.string(), updatedAt: z.string(),
});

const adminOverviewSchema = z.object({
  counts: z.object({ organizations: z.number(), rankas: z.number(), openPrivacyRequests: z.number(), openIncidents: z.number() }),
  metrics: z.array(z.object({ route_key: z.string(), samples: z.number(), p50Ms: z.number(), p95Ms: z.number(), p99Ms: z.number(), errorPercent: z.coerce.number() })),
  incidents: z.array(z.object({ id: z.string().uuid(), kind: z.string(), severity: z.string(), status: z.string(), title: z.string(), routeKey: z.string().nullish(), evidence: z.record(z.string(), z.unknown()), lastSeenAt: z.string() })),
});

export type PendingLegalDocument = z.infer<typeof legalDocumentSchema>;
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export class TrustRepository {
  constructor(private readonly client: SupabaseClient) {}

  async pendingLegalDocuments() {
    const { data, error } = await this.client.rpc("get_pending_legal_documents");
    if (error) throw error;
    return z.array(legalDocumentSchema).parse(data ?? []);
  }

  async privacyRequests(orgId: string) {
    const { data, error } = await this.client.rpc("list_privacy_requests", { p_org_id: orgId });
    if (error) throw error;
    return z.array(privacyRequestSchema).parse(data ?? []);
  }

  async adminCapability() {
    const { data, error } = await this.client.rpc("get_platform_admin_capability");
    if (error) return { active: false, aal2: false };
    return z.object({ active: z.boolean(), aal2: z.boolean() }).parse(data);
  }

  async adminOverview(reason: string) {
    const { data, error } = await this.client.rpc("get_platform_admin_overview", { p_reason: reason });
    if (error) throw error;
    return adminOverviewSchema.parse(data);
  }

  async commercialPlan() {
    const { data, error } = await this.client.rpc("get_commercial_plan");
    if (error) throw error;
    return commercialPlanSchema.parse(data);
  }
}
