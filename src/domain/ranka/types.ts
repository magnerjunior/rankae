export type AttendanceStatus =
  | "present"
  | "temporarily_out"
  | "left"
  | "no_show"
  | "inactive";

export type PlayerRole = "line" | "keeper";

export interface Player {
  id: string;
  fullName: string;
  aliases: string[];
  role: PlayerRole;
}

export interface Attendance {
  id: string;
  playerId: string;
  arrivalIndex: number;
  status: AttendanceStatus;
}

export interface Squad {
  id: string;
  number: number;
  playerIds: string[];
  complete: boolean;
  deficit: number;
}

export type FieldSide = "yellow" | "red";

export interface OfficialSuggestion {
  yellowKeeperId?: string;
  redKeeperId?: string;
  borrowedKeeperIds: string[];
  ballBoyIds: string[];
  waitingKeeperIds: string[];
  warnings: string[];
}

export interface TiePolicy {
  overtimeMinutes: number;
  onFirstTie: "overtime" | "both_out" | "penalties" | "odd_even" | "draw" | "manual";
  afterOvertime: "both_out" | "penalties" | "odd_even" | "draw" | "manual";
  ifWaitingFullSquadsAtLeast: number;
  whenWaitingBelowThreshold: "penalties" | "odd_even" | "manual";
}

export type TieAction =
  | { type: "overtime"; minutes: number }
  | { type: "both_out" }
  | { type: "penalties" | "odd_even" | "draw" | "manual"; reason: string };

export interface RotationResult {
  yellowSquadId?: string;
  redSquadId?: string;
  waitingSquadIds: string[];
  warnings: string[];
}
