import type { Attendance, Player, Squad } from "@/domain/ranka/types";

export interface RankaSnapshot {
  id: string;
  orgId?: string;
  sessionId?: string;
  name: string;
  sessionLabel: string;
  players: Player[];
  attendance: Attendance[];
  squads: Squad[];
  revision: number;
}

export interface RankaRepository {
  getSnapshot(rankaId: string): Promise<RankaSnapshot>;
  saveAttendance(input: {
    rankaId: string;
    attendance: Attendance[];
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<RankaSnapshot>;
}
