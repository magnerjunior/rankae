import type { SupabaseClient } from "@supabase/supabase-js";
import { groupSquads } from "@/domain/ranka/rules";
import type { Attendance, Player } from "@/domain/ranka/types";
import type { RankaRepository, RankaSnapshot } from "@/data/ports/ranka-repository";

interface RankaRow { id: string; org_id: string; name: string; }
interface SessionRow { id: string; scheduled_on: string; revision: number; }
interface PlayerRow { id: string; full_name: string; nickname: string | null; role_preference: "line" | "keeper" | "either"; player_aliases?: { alias: string }[]; }
interface AttendanceRow { id: string; player_id: string; arrival_index: number; status: Attendance["status"]; }

export class SupabaseRankaRepository implements RankaRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSnapshot(rankaId: string): Promise<RankaSnapshot> {
    const { data: ranka, error: rankaError } = await this.client.from("rankas").select("id,org_id,name").eq("id", rankaId).single();
    if (rankaError || !ranka) throw new Error("Ranka não encontrado ou não autorizado.");
    const typedRanka = ranka as RankaRow;

    const [{ data: sessions, error: sessionError }, { data: playerRows, error: playersError }] = await Promise.all([
      this.client.from("sessions").select("id,scheduled_on,revision").eq("ranka_id", rankaId).order("scheduled_on", { ascending: false }).limit(1),
      this.client.from("players").select("id,full_name,nickname,role_preference,player_aliases(alias)").eq("org_id", typedRanka.org_id).eq("status", "active").order("normalized_name"),
    ]);
    if (sessionError || playersError) throw new Error("Não foi possível carregar a sessão autorizada.");
    const session = (sessions?.[0] ?? null) as SessionRow | null;
    if (!session) throw new Error("Este ranka ainda não possui sessão.");

    const { data: attendanceRows, error: attendanceError } = await this.client.from("attendance").select("id,player_id,arrival_index,status").eq("session_id", session.id).order("arrival_index");
    if (attendanceError) throw new Error("Não foi possível carregar a chegada.");

    const players: Player[] = ((playerRows ?? []) as PlayerRow[]).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      aliases: [row.nickname, ...(row.player_aliases ?? []).map((alias) => alias.alias)].filter((value): value is string => Boolean(value)),
      role: row.role_preference === "keeper" ? "keeper" : "line",
    }));
    const attendance: Attendance[] = ((attendanceRows ?? []) as AttendanceRow[]).map((row) => ({
      id: row.id,
      playerId: row.player_id,
      arrivalIndex: row.arrival_index,
      status: row.status,
    }));

    return {
      id: typedRanka.id,
      orgId: typedRanka.org_id,
      sessionId: session.id,
      name: typedRanka.name,
      sessionLabel: new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${session.scheduled_on}T12:00:00Z`)),
      players,
      attendance,
      squads: groupSquads(attendance, players),
      revision: session.revision,
    };
  }

  async saveAttendance(): Promise<RankaSnapshot> {
    throw new Error("Escritas usam RPC transacional; não há gravação direta de presença.");
  }
}
