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
  publicVisible?: boolean;
  publicDisplayName?: string;
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

export type MatchState =
  | "draft"
  | "ready"
  | "live"
  | "paused"
  | "regulation_ended"
  | "overtime_live"
  | "overtime_paused"
  | "tie_break"
  | "completed"
  | "cancelled"
  | "manual_review";

export type ClockPhase = "regulation" | "overtime";

export interface MatchClockSnapshot {
  state: MatchState;
  startedAtServer?: string;
  elapsedMsBeforeStart: number;
  durationLimitMs: number;
  asOfServer: string;
}

export type MatchEventType = "goal" | "penalty_attempt" | "marker" | "tie_resolution";
export type GoalKind = "normal" | "penalty" | "own_goal";
export type PenaltyOutcome = "converted" | "missed" | "saved";

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  side?: FieldSide;
  scorerPlayerId?: string;
  assistPlayerId?: string;
  keeperPlayerId?: string;
  goalKind?: GoalKind;
  penaltyOutcome?: PenaltyOutcome;
  occurrenceMs: number;
  status: "active" | "void";
  label?: string;
}

export interface ScoreProjection {
  yellow: number;
  red: number;
  convertedPenalties: number;
  missedPenalties: number;
  savedPenalties: number;
}

export type ContributionStatus = "pending" | "paid" | "waived";

export interface ContributionRecord {
  playerId: string;
  amountCents: number;
  status: ContributionStatus;
}
