import type {
  Attendance,
  ContributionRecord,
  FieldSide,
  MatchEvent,
  MatchState,
  Player,
  Squad,
} from "@/domain/ranka/types";

export interface SessionRules {
  squadSize: number;
  maxLinePlayers: number;
  maxKeepers: number;
  regulationDurationMs: number;
  overtimeDurationMs: number;
  targetGoals: number;
  targetGoalDifference: number;
  tiePolicy: "overtime" | "both_out" | "penalties" | "odd_even" | "manual";
  contributionMode: "fixed" | "divide_total";
  totalCostCents: number;
}

export interface MatchAssignment {
  id: string;
  playerId: string;
  squadId?: string;
  side?: FieldSide;
  role: "line" | "keeper" | "borrowed_keeper" | "ball_boy";
}

export interface LiveMatch {
  id: string;
  ordinal: number;
  yellowSquadId: string;
  redSquadId: string;
  state: MatchState;
  clockPhase: "regulation" | "overtime";
  startedAtServer?: string;
  elapsedMsBeforeStart: number;
  durationLimitMs: number;
  regulationDurationMs: number;
  overtimeDurationMs: number;
  revision: number;
  serverNow: string;
  assignments: MatchAssignment[];
  events: MatchEvent[];
}

export interface RankaSnapshot {
  id: string;
  orgId?: string;
  sessionId?: string;
  name: string;
  sessionLabel: string;
  sessionDate: string;
  sessionState: "planned" | "check_in" | "team_formation" | "running" | "paused" | "completed";
  players: Player[];
  attendance: Attendance[];
  squads: Squad[];
  hasPersistedSquads: boolean;
  rules: SessionRules;
  contributionAmountCents: number;
  contributions: ContributionRecord[];
  activeMatch?: LiveMatch;
  revision: number;
  portal?: {
    slug: string;
    visibility: "public" | "unlisted" | "pin_protected" | "private_off";
    hasProtectedLink: boolean;
  };
}

export interface SessionSummary {
  matches: number;
  topTeam?: { number: number; label?: string; wins: number; players: string[] };
  bottomTeam?: { number: number; label?: string; losses: number; players: string[] };
  topScorer?: { name: string; total: number };
  topAssist?: { name: string; total: number };
  bestKeeper?: { name: string; conceded: number; matches: number };
  worstKeeper?: { name: string; conceded: number; matches: number };
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
