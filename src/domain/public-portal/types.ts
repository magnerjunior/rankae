import type { MatchState } from "@/domain/ranka/types";

export type PortalPeriod = "last" | "month" | "season" | "day";

export interface PublicPlayerStat {
  name: string;
  goals: number;
  assists: number;
  penaltiesTaken: number;
  penaltiesConverted: number;
  penaltiesMissed: number;
  penaltiesSaved: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface PublicSquad {
  number: number;
  players: string[];
}

export interface PublicMatchSide extends PublicSquad {
  score: number;
}

export interface PublicLiveMatch {
  ordinal: number;
  state: MatchState;
  clockPhase: "regulation" | "overtime";
  startedAtServer?: string;
  elapsedMsBeforeStart: number;
  durationLimitMs: number;
  yellow: PublicMatchSide;
  red: PublicMatchSide;
  ballBoys: string[];
  keepers: { yellow?: string; red?: string };
}

export interface PublicResult {
  matchId?: string;
  date: string;
  ordinal: number;
  yellowSquadNumber: number;
  redSquadNumber: number;
  yellowScore: number;
  redScore: number;
}

export interface PublicRankaSnapshot {
  rankaName: string;
  slug: string;
  sessionDate?: string;
  liveMatch?: PublicLiveMatch;
  nextSquads: PublicSquad[];
  results: PublicResult[];
  stats: PublicPlayerStat[];
  period: PortalPeriod;
  periodLabel: string;
  snapshotVersion: number;
  asOfServer: string;
}

export interface PublicSessionDate {
  date: string;
  count: number;
}

export interface PortalGateState {
  status: "open" | "link_required" | "pin_required" | "unavailable";
  rankaName?: string;
  linkRequired?: boolean;
  warning?: string;
}

