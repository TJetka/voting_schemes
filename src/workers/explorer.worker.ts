import { allianceBounds, allianceIdsForRule, type AllianceRule } from '../model/alliances';
import { enumeratePartitions, partitionLists } from '../model/coalitions';
import { evaluateScenario } from '../model/engine';
import { calibrate } from '../model/geography';
import { heatCell, scenarioAt, summarizePoint, sweepValues, transitionBetween, validateHeatAxes, type SweepPoint, type Transition } from '../model/sensitivity';
import { validateScenario } from '../model/validation';
import type { Result } from '../model/types';
import type { ConfigurationRow, WorkerRequest, WorkerResponse } from './protocol';

// Terminating the worker cancels ongoing loops immediately; every message also carries a generation ID.
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, fingerprint, job } = event.data;
  const started = performance.now();
  const send = (payload: Omit<WorkerResponse, 'requestId' | 'fingerprint'>) => self.postMessage({ ...payload, requestId, fingerprint });
  const progress = (completed: number, total: number) => self.postMessage({ type: 'progress', requestId, fingerprint, completed, total });
  try {
    const scenario = validateScenario(job.scenario);
    if (job.kind === 'exhaustive') {
      const fit = calibrate(scenario);
      const partitions = enumeratePartitions(scenario.entities);
      const rows: ConfigurationRow[] = [];
      for (let index = 0; index < partitions.length; index++) {
        const partition = partitions[index];
        const sample = { ...scenario, lists: partitionLists(partition, job.policy), allianceSelection: [] };
        const result = evaluateScenario(sample, fit);
        const rules = Object.fromEntries((['L', 'R', 'L+C', 'R+C'] as AllianceRule[]).map((rule) => [rule, allianceBounds(result, allianceIdsForRule(sample, rule))])) as ConfigurationRow['rules'];
        rows.push({ partition, eligibleCount: result.eligibleListCount, runningCount: result.runningListCount, excludedVoteShare: result.excludedVoteShare, campSeats: result.campSeats, rules });
        if (index % 25 === 0) progress(index + 1, partitions.length);
      }
      self.postMessage({ type: 'done', kind: job.kind, requestId, fingerprint, rows, elapsedMs: performance.now() - started });
    } else if (job.kind === 'sweep') {
      const { values, thresholds } = sweepValues(scenario, job.axis);
      const points: SweepPoint[] = [];
      const transitions: Transition[] = [];
      let previous: Result | undefined;
      for (const [index, x] of values.entries()) {
        const sample = scenarioAt(scenario, job.axis, x);
        const result = evaluateScenario(sample);
        const point = summarizePoint(sample, result, x, thresholds.has(x), job.rule, job.axis.targetId);
        if (previous) { const transition = transitionBetween(previous, result, points.at(-1)!, point); if (transition) transitions.push(transition); }
        points.push(point); previous = result;
        if (index % 10 === 0) progress(index + 1, values.length);
      }
      self.postMessage({ type: 'done', kind: job.kind, requestId, fingerprint, output: { points, transitions, axis: job.axis }, elapsedMs: performance.now() - started });
    } else {
      const { xValues, yValues } = validateHeatAxes(job.xAxis, job.yAxis, job.refinement);
      const cells = [];
      for (const y of yValues) for (const x of xValues) {
        cells.push(heatCell(scenario, job.xAxis, job.yAxis, x, y, job.rule));
        if (cells.length % 20 === 0) progress(cells.length, xValues.length * yValues.length);
      }
      self.postMessage({ type: 'done', kind: job.kind, requestId, fingerprint, output: { cells, xValues, yValues, xAxis: job.xAxis, yAxis: job.yAxis }, elapsedMs: performance.now() - started });
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) } as Omit<WorkerResponse, 'requestId' | 'fingerprint'>);
  }
};
