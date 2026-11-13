import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PortalGateState, PortalPeriod, PublicRankaSnapshot, PublicSessionDate } from "@/domain/public-portal/types";

const gateSchema = z.object({
  status: z.enum(["open", "link_required", "pin_required", "unavailable"]),
  ranka_name: z.string().optional(),
  link_required: z.boolean().optional(),
  warning: z.string().optional(),
});

const playerStatSchema = z.object({
  name: z.string(), goals: z.number(), assists: z.number(), penaltiesTaken: z.number(), penaltiesConverted: z.number(),
  penaltiesMissed: z.number(), penaltiesSaved: z.number(), matches: z.number(), wins: z.number(), losses: z.number(), draws: z.number(),
});
const squadSchema = z.object({ number: z.number(), players: z.array(z.string()) });
const resultSchema = z.object({ matchId: z.string().uuid().optional(), date: z.string(), ordinal: z.number(), yellowSquadNumber: z.number(), redSquadNumber: z.number(), yellowScore: z.number(), redScore: z.number() });
const liveSchema = z.object({
  ordinal: z.number(), state: z.enum(["draft","ready","live","paused","regulation_ended","overtime_live","overtime_paused","tie_break","completed","cancelled","manual_review"]),
  clockPhase: z.enum(["regulation","overtime"]), startedAtServer: z.string().nullish(), elapsedMsBeforeStart: z.number(), durationLimitMs: z.number(),
  yellow: squadSchema.extend({ score: z.number() }), red: squadSchema.extend({ score: z.number() }),
  ballBoys: z.array(z.string()), keepers: z.object({ yellow: z.string().nullish(), red: z.string().nullish() }),
});
const snapshotSchema = z.object({
  rankaName: z.string(), slug: z.string(), sessionDate: z.string().nullish(), liveMatch: liveSchema.nullish(), nextSquads: z.array(squadSchema),
  results: z.array(resultSchema), stats: z.array(playerStatSchema), period: z.enum(["last","month","season","day"]), periodLabel: z.string(),
  snapshotVersion: z.number(), asOfServer: z.string(),
});

export class PublicPortalRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getGate(slug: string): Promise<PortalGateState> {
    const { data, error } = await this.client.rpc("get_public_portal_gate", { p_slug: slug });
    if (error) throw new Error("Não foi possível verificar o acesso público.");
    const gate = gateSchema.parse(data);
    return { status: gate.status, rankaName: gate.ranka_name, linkRequired: gate.link_required, warning: gate.warning };
  }

  async getSnapshot(input: { slug: string; grant?: string; period: PortalPeriod; date?: string; internal?: boolean }): Promise<PublicRankaSnapshot | null> {
    const { data, error } = await this.client.rpc(input.internal ? "get_internal_ranka_statistics" : "get_public_ranka_snapshot", {
      p_slug: input.slug,
      ...(input.internal ? {} : { p_grant_token: input.grant ?? null }),
      p_period: input.period,
      p_specific_date: input.date ?? null,
    });
    if (input.internal && error?.code === "PGRST202") return this.getSnapshot({ ...input, internal: false });
    if (error) throw new Error("Não foi possível carregar o placar público.");
    if (!data) return null;
    const parsed = snapshotSchema.parse(data);
    return {
      ...parsed,
      sessionDate: parsed.sessionDate ?? undefined,
      liveMatch: parsed.liveMatch ? {
        ...parsed.liveMatch,
        startedAtServer: parsed.liveMatch.startedAtServer ?? undefined,
        keepers: { yellow: parsed.liveMatch.keepers.yellow ?? undefined, red: parsed.liveMatch.keepers.red ?? undefined },
      } : undefined,
    };
  }

  async getCalendar(input: { slug: string; grant?: string; month: string }): Promise<PublicSessionDate[]> {
    const { data, error } = await this.client.rpc("get_public_ranka_calendar", {
      p_slug: input.slug,
      p_grant_token: input.grant ?? null,
      p_month: `${input.month}-01`,
    });
    if (error || !Array.isArray(data)) throw new Error("Não foi possível carregar o calendário público.");
    return z.array(z.object({ date: z.string(), count: z.number().int().positive() })).parse(data);
  }

  async exchange(input: { slug: string; linkToken?: string; pin?: string; grantToken: string; fingerprint: string }) {
    const { data, error } = await this.client.rpc("exchange_public_portal_access", {
      p_slug: input.slug,
      p_link_token: input.linkToken ?? null,
      p_pin: input.pin ?? null,
      p_grant_token: input.grantToken,
      p_fingerprint: input.fingerprint,
    });
    if (error || !data || typeof data !== "object") return { authorized: false, status: "invalid" } as const;
    const result = data as { authorized?: boolean; status?: string; retry_after_seconds?: number };
    return { authorized: result.authorized === true, status: result.status ?? "invalid", retryAfterSeconds: result.retry_after_seconds };
  }
}

