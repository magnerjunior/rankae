import type {
  Attendance,
  ContributionRecord,
  FieldSide,
  MatchEvent,
  MatchState,
  Player,
  Squad,
} from "@/domain/ranka/types";
import type { KitColor } from "@/domain/ranka/kit-colors";

export interface SessionRules {
  squadSize: number;
  maxLinePlayers: number;
  maxKeepers: number;
  regulationDurationMs: number;
  overtimeDurationMs: number;
  targetGoals: number;
  targetGoalDifference: number;
  tiePolicy: "overtime" | "both_out" | "penalties" | "odd_even" | "manual";
  tieBothOutWithFour?: boolean;
  tieFallback?: "odd_even" | "manual" | "penalties";
  contributionMode: "fixed" | "divide_total";
  totalCostCents: number;
  waiveKeeperContributions: boolean;
}

export interface MatchAssignment {
  id: string;
  playerId: string;
  squadId?: string;
  side?: FieldSide;
  role: "line" | "keeper" | "borrowed_keeper" | "ball_boy";
  endMs?: number;
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
  substitutions?: { id: string; outgoingId: string; incomingId: string; squadId: string; occurrenceMs?: number }[];
  events: MatchEvent[];
}

export interface RankaSnapshot {
  id: string;
  rankaRevision?: number;
  keeperWaiver?: boolean;
  kits?: { yellow: KitColor; red: KitColor };
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

export interface RankaDayTotals {
  matches: number;
  goals: number;
  assists: number;
}

export interface RankaDayOverview extends RankaDayTotals {
  lastDay: (RankaDayTotals & { id: string; date: string }) | null;
  star: { name: string; goals: number; assists: number } | null;
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
