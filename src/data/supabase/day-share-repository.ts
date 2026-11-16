import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayShareData } from "@/domain/ranka/day-share";

const PAGE_SIZE = 500;

async function allRows<Row>(read: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new Error("Não foi possível preparar o resumo do dia.");
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function getDayShareData(client: SupabaseClient, sessionId: string, orgId: string): Promise<DayShareData> {
  const [games, squads, assignments, events, audits] = await Promise.all([
    allRows<DayShareData["games"][number]>((from, to) => client.from("matches")
      .select("id,ordinal,state,yellow_squad_id,red_squad_id").eq("session_id", sessionId).eq("state", "completed").order("id").range(from, to)),
    allRows<DayShareData["squads"][number]>((from, to) => client.from("squads")
      .select("id,squad_number").eq("session_id", sessionId).order("id").range(from, to)),
    allRows<DayShareData["assignments"][number]>((from, to) => client.from("match_assignments")
      .select("match_id,field_side,role,status,player_id,start_ms").eq("session_id", sessionId).neq("status", "cancelled").neq("role", "ball_boy").order("id").range(from, to)),
    allRows<DayShareData["events"][number]>((from, to) => client.from("match_events")
      .select("match_id,event_type,status,side,scorer_player_id,assist_player_id,goal_kind,penalty_outcome,metadata")
      .eq("session_id", sessionId).eq("status", "active").in("event_type", ["goal", "penalty_attempt", "tie_resolution"]).order("created_at").order("id").range(from, to)),
    allRows<{ match_id: string | null; after_data: { result?: string } | null }>((from, to) => client.from("audit_logs")
      .select("match_id,after_data").eq("session_id", sessionId).eq("action", "complete_and_rotate").order("created_at").order("id").range(from, to)),
  ]);
  const gameIds = new Set(games.map((game) => game.id));
  const ids = [...new Set([
    ...assignments.filter((row) => gameIds.has(row.match_id)).map((row) => row.player_id),
    ...events.filter((row) => gameIds.has(row.match_id)).flatMap((row) => [row.scorer_player_id, row.assist_player_id]),
  ].filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  for (let from = 0; from < ids.length; from += 100) {
    const { data, error } = await client.from("players").select("id,full_name").eq("org_id", orgId).in("id", ids.slice(from, from + 100));
    if (error || !data) throw new Error("Não foi possível carregar os nomes dos jogadores.");
    for (const player of data) names.set(player.id, player.full_name);
  }
  const official = new Map<string, string>();
  for (const audit of audits) {
    const result = audit.after_data?.result;
    if (audit.match_id && (result === "yellow" || result === "red" || result === "both_out")) official.set(audit.match_id, result);
  }
  return { games, squads, assignments, events, official, names };
}
