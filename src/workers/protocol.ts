import type { AllianceRule } from '../model/alliances';
import type { Axis, HeatOutput, SweepOutput } from '../model/sensitivity';
import type { CommitteeType, Scenario, SeatBounds } from '../model/types';
export interface ConfigurationRow {
  partition: string[][];
  eligibleCount: number;
  runningCount: number;
  excludedVoteShare: number;
  campSeats: { L: number; R: number; C: number };
  rules: Record<AllianceRule, SeatBounds>;
}
export type Job =
  | { kind: 'exhaustive'; scenario: Scenario; policy: CommitteeType }
  | { kind: 'sweep'; scenario: Scenario; axis: Axis; rule: AllianceRule }
  | {
      kind: 'heat';
      scenario: Scenario;
      xAxis: Axis;
      yAxis: Axis;
      rule: AllianceRule;
      refinement: boolean;
    };
export interface WorkerRequest {
  requestId: number;
  fingerprint: string;
  job: Job;
}
export type WorkerResponse = { requestId: number; fingerprint: string } & (
  | { type: 'progress'; completed: number; total: number }
  | { type: 'error'; message: string }
  | { type: 'done'; kind: 'exhaustive'; rows: ConfigurationRow[]; elapsedMs: number }
  | { type: 'done'; kind: 'sweep'; output: SweepOutput; elapsedMs: number }
  | { type: 'done'; kind: 'heat'; output: HeatOutput; elapsedMs: number }
);
export function isCurrentResponse(
  response: Pick<WorkerResponse, 'requestId' | 'fingerprint'>,
  requestId: number,
  fingerprint: string,
): boolean {
  return response.requestId === requestId && response.fingerprint === fingerprint;
}
