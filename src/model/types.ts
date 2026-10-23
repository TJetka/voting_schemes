export type Family = 'L' | 'R' | 'C';
export type CommitteeType = 'ordinary' | 'coalition';
export type GeographyMode = 'historical' | 'uniform';
export interface Entity {
  id: string;
  label: string;
  family: Family;
  active: boolean;
  supportUnits: number;
  publishedPollSharePct: number | null;
  supportStatus: 'measured' | 'unmeasured';
  proxyId: string;
  locked: boolean;
}
export interface ElectoralList {
  id: string;
  memberEntityIds: string[];
  committeeType: CommitteeType;
  minorityExempt: boolean;
}
export interface Residual {
  supportUnits: number;
  components: { label: string; publishedSharePct: number }[];
  eligibilityAssumption: 'no-seats';
}
export interface Scenario {
  schemaVersion: 1;
  modelVersion: string;
  dataVersion: string;
  pollId: string;
  name: string;
  entities: Entity[];
  lists: ElectoralList[];
  residual: Residual;
  turnout: number;
  geographyMode: GeographyMode;
  allianceSelection: string[];
  notes: string[];
  familyLabels: Record<Family, string>;
}
export interface PollSnapshot {
  id: string;
  pollster: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  publicationDate: string;
  sampleSize: number;
  mode: string | null;
  undecidedTreatment: string | null;
  sourceUrls: string[];
  rawResponses: Record<string, number>;
  denominatorConvention: string;
  lastVerified: string;
}
export interface District {
  id: number;
  commissionSeat: string;
  boundaryDescription: string;
  seats: number;
  eligible2023: number;
  ballots2023: number;
  validVotes2023: number;
  invalidVotes2023: number;
  votesByCommittee: Record<string, number>;
  onBallot: Record<string, boolean>;
}
export interface HistoricalData {
  schemaVersion: number;
  dataVersion: string;
  electionDate: string;
  totals: {
    eligible2023: number;
    ballots2023: number;
    validVotes2023: number;
    invalidVotes2023: number;
    seats: number;
  };
  committees: {
    id: string;
    label: string;
    committeeType: CommitteeType;
    minorityExempt: boolean;
  }[];
  districts: District[];
  officialSeats: {
    national: Record<string, number>;
    districts: Record<string, Record<string, number>>;
  };
}
export interface SeatBounds {
  lower: number;
  upper: number;
}
export interface Eligibility {
  eligible: boolean;
  thresholdPct: number;
  reason: string;
  supportUnits: number;
}
export interface Quotient {
  listId: string;
  votes: number;
  divisor: number;
  value: number;
  awarded: boolean;
}
export interface UnresolvedBoundary {
  seats: number;
  listIds: string[];
  reason: 'precinct-tie' | 'numerical';
}
export interface DistrictAllocation {
  districtId: number;
  status: 'resolved' | 'ambiguous' | 'unallocatable';
  seatsByList: Record<string, number>;
  seatBounds: Record<string, SeatBounds>;
  votesByList: Record<string, number>;
  trace: Quotient[];
  lastWinning: Quotient | null;
  firstLosing: Quotient | null;
  quotientGap: number | null;
  unresolved: UnresolvedBoundary | null;
}
export interface Calibration {
  matrix: number[][];
  entityIds: string[];
  iterations: number;
  maxError: number;
  fingerprint: string;
}
export interface Result {
  status: 'resolved' | 'ambiguous' | 'unallocatable';
  eligibility: Record<string, Eligibility>;
  thresholdRegime: 'normal' | 'fallback';
  districtAllocations: DistrictAllocation[];
  nationalListSeats: Record<string, number>;
  nationalListSeatBounds: Record<string, SeatBounds>;
  campSeats: Record<Family, number>;
  campBounds: Record<Family, SeatBounds>;
  allianceSeats: SeatBounds;
  excludedVoteShare: number;
  runningListCount: number;
  eligibleListCount: number;
  winningListCount: number;
  warnings: string[];
  calibration: { iterations: number; maxError: number };
}
