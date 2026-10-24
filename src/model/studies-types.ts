import type { CommitteeType, Scenario, SeatBounds } from './types';

export type StudyBlock = 'LC' | 'R';
export type StudyStatus = 'resolved' | 'ambiguous' | 'unallocatable';

/** Bounds concern whole parliamentary blocks; a tie between two LC lists may leave both blocks exact. */
export interface StudyOutcome {
  status: StudyStatus;
  allocationStatus: StudyStatus;
  lc: SeatBounds;
  r: SeatBounds;
  pair: SeatBounds | null;
  eligibleIds: string[];
  excludedVoteShare: number;
}
export interface MatrixPartition {
  id: string;
  label: string;
  groups: string[][];
}
export interface MatrixCell {
  row: number;
  column: number;
  outcome: StudyOutcome;
}
export interface SampleExtrema {
  minimum: number;
  maximum: number;
  maximumLower: number;
  bestIndices: number[];
  possibleBestIndices: number[];
  resolved: boolean;
}
export interface StudySummary {
  lc: SampleExtrema;
  r: SampleExtrema;
  pair: SampleExtrema | null;
  lcMajorities: number;
  rMajorities: number;
  noMajority: number;
  unresolved: number;
}
export interface MatrixAxisSummary {
  index: number;
  minimum: number;
  maximum: number;
  guaranteedMajority: boolean;
}
export interface CoalitionMatrixStudy {
  policy: CommitteeType;
  rows: MatrixPartition[];
  columns: MatrixPartition[];
  cells: MatrixCell[];
  summary: StudySummary;
  columnSummaries: MatrixAxisSummary[];
  rowSummaries: MatrixAxisSummary[];
  maximinLcColumnIndices: number[];
  maximinRRowIndices: number[];
}
export type SampleKind =
  | 'grid'
  | 'mirrored-grid'
  | 'endpoint'
  | 'current'
  | 'threshold'
  | 'threshold-neighbour'
  | 'balanced';
export interface StudyPoint {
  xUnits: number;
  otherUnits: number;
  kinds: SampleKind[];
  outcome: StudyOutcome;
}
export interface PairStudy {
  id: string;
  targetId: string;
  donorId: string;
  targetLabel: string;
  donorLabel: string;
  block: StudyBlock;
  totalUnits: number;
  baselineUnits: number;
  stepUnits: number;
  points: StudyPoint[];
  pooled: StudyOutcome;
  summary: StudySummary;
}
export interface ConcentrationStudy {
  id: 'lc-concentration';
  interpretation: 'shared-profile';
  totalUnits: number;
  baselineUnits: number;
  stepUnits: number;
  defaultOutcome: StudyOutcome;
  oneParty: StudyOutcome;
  points: StudyPoint[];
  summary: StudySummary;
}
export interface StudyReport {
  metadata: {
    analysisVersion: string;
    modelVersion: string;
    dataVersion: string;
    pollId: string;
    pollster: string;
    fieldworkStart: string;
    fieldworkEnd: string;
    publicationDate: string;
    sampleSize: number;
    geographyMode: Scenario['geographyMode'];
    regularizer: number;
    scenario: Scenario;
    sourceUrls: string[];
    assumptions: string[];
  };
  baseline: StudyOutcome;
  matrices: Record<CommitteeType, CoalitionMatrixStudy>;
  pairs: PairStudy[];
  concentration: ConcentrationStudy;
}
export interface StudyProgress {
  completed: number;
  total: number;
  stage: string;
}
export type StudyProgressCallback = (progress: StudyProgress) => void;
