import { beforeAll, describe, expect, it } from 'vitest';
import { allianceBounds, allianceIdsForRule } from '../src/model/alliances';
import { mergeEntities, partitionLists } from '../src/model/coalitions';
import { DATA_VERSION, MODEL_VERSION, SUPPORT_TOTAL } from '../src/model/constants';
import { evaluateScenario } from '../src/model/engine';
import { calibrate } from '../src/model/geography';
import { createDefaultScenario, pollSnapshot } from '../src/model/presets';
import {
  buildCoalitionMatrix,
  buildConcentrationStudy,
  buildPairStudy,
  buildStudyReport,
  sampledExtrema,
  studySampleValues,
  summarizeStudyOutcomes,
  type StudyOutcome,
  type StudyReport,
} from '../src/model/studies';
import { redistributeSupport } from '../src/model/support';
import type { CommitteeType, SeatBounds } from '../src/model/types';

const exact = (value: number): SeatBounds => ({ lower: value, upper: value });
let report: StudyReport;
beforeAll(() => {
  report = buildStudyReport();
});

function expectChamber(outcome: StudyOutcome): void {
  for (const bounds of [outcome.lc, outcome.r]) {
    expect(Number.isSafeInteger(bounds.lower)).toBe(true);
    expect(Number.isSafeInteger(bounds.upper)).toBe(true);
    expect(bounds.lower).toBeGreaterThanOrEqual(0);
    expect(bounds.upper).toBeLessThanOrEqual(460);
    expect(bounds.lower).toBeLessThanOrEqual(bounds.upper);
  }
  // Complementary block bounds, not sums of separately attainable list bounds.
  expect(outcome.lc.lower + outcome.r.upper).toBe(460);
  expect(outcome.lc.upper + outcome.r.lower).toBe(460);
  if (outcome.status === 'resolved') {
    expect(outcome.lc.lower).toBe(outcome.lc.upper);
    expect(outcome.r.lower).toBe(outcome.r.upper);
  }
}

describe('frozen, reproducible published studies', () => {
  it('records the dated poll, exact inputs and model assumptions separately from results', () => {
    expect(report.metadata).toMatchObject({
      modelVersion: MODEL_VERSION,
      dataVersion: DATA_VERSION,
      pollId: pollSnapshot.id,
      geographyMode: 'family',
      fieldworkStart: '2026-10-19',
      fieldworkEnd: '2026-10-21',
      sampleSize: 1014,
      regularizer: 0.01,
      scenario: createDefaultScenario(),
    });
    expect(report.metadata.sourceUrls).toEqual(pollSnapshot.sourceUrls);
    expect(report.metadata.assumptions.length).toBeGreaterThan(5);
    expect(report.baseline.lc).toEqual(exact(226));
    expect(report.baseline.r).toEqual(exact(234));
    expect(report.baseline.excludedVoteShare).toBeCloseTo(5.67, 12);
  });

  it('builds deterministically and keeps the source scenario and calibration immutable', () => {
    expect(buildStudyReport()).toEqual(report);
    const scenario = createDefaultScenario();
    const fit = calibrate(scenario);
    const original = structuredClone({ scenario, fit });
    buildPairStudy(scenario, 'razem', 'nl', fit);
    buildConcentrationStudy(scenario, fit);
    expect({ scenario, fit }).toEqual(original);
  });
});

describe('all R versus L+C electoral partitions', () => {
  it.each(['coalition', 'ordinary'] as const)(
    'covers each Cartesian-product configuration once under %s joint-list treatment',
    (policy) => {
      const matrix = report.matrices[policy];
      expect(matrix.rows).toHaveLength(15);
      expect(matrix.columns).toHaveLength(52);
      expect(matrix.cells).toHaveLength(780);
      const right = ['kkp', 'konf', 'pis', 'rozwoj'];
      const leftCentre = ['ko', 'nl', 'pl2050', 'psl', 'razem'];
      for (const [axis, members] of [
        [matrix.rows, right],
        [matrix.columns, leftCentre],
      ] as const) {
        expect(new Set(axis.map((partition) => JSON.stringify(partition.groups))).size).toBe(
          axis.length,
        );
        expect(new Set(axis.map((partition) => partition.id)).size).toBe(axis.length);
        for (const partition of axis) {
          expect(partition.groups.flat().sort()).toEqual(members);
          expect(partition.groups.every((group) => group.length > 0)).toBe(true);
        }
      }
      expect(new Set(matrix.cells.map((cell) => `${cell.row}:${cell.column}`)).size).toBe(780);
      for (const cell of matrix.cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(15);
        expect(cell.column).toBeGreaterThanOrEqual(0);
        expect(cell.column).toBeLessThan(52);
        expectChamber(cell.outcome);
      }
    },
  );

  // Independent stdlib Python IPF plus quotient enumeration, using the frozen historical JSON.
  it.each([
    ['coalition', 357, 383, 40],
    ['ordinary', 383, 362, 35],
  ] as const)(
    'matches independently calculated block counts for %s',
    (policy, lcMajorities, rMajorities, noMajority) => {
      const { summary } = report.matrices[policy];
      expect(summary).toMatchObject({ lcMajorities, rMajorities, noMajority, unresolved: 0 });
      expect(summary.lc).toMatchObject({ minimum: 194, maximum: 264, resolved: true });
      expect(summary.r).toMatchObject({ minimum: 196, maximum: 266, resolved: true });
      expect(lcMajorities + rMajorities + noMajority).toBe(780);
    },
  );

  it.each(['coalition', 'ordinary'] as const)(
    'finds a unique L+C configuration that guarantees at least 233 seats under %s',
    (policy) => {
      const matrix = report.matrices[policy];
      expect(matrix.maximinLcColumnIndices).toHaveLength(1);
      const index = matrix.maximinLcColumnIndices[0];
      expect(matrix.columns[index].groups).toHaveLength(1);
      expect(matrix.columnSummaries[index]).toMatchObject({
        minimum: 233,
        maximum: 264,
        guaranteedMajority: true,
      });
      const allRight = matrix.rows.findIndex((row) => row.groups.length === 1);
      const bothFull = matrix.cells.find((cell) => cell.row === allRight && cell.column === index)!;
      expect(bothFull.outcome.lc).toEqual(exact(233));
      expect(bothFull.outcome.r).toEqual(exact(227));
      expect(matrix.rowSummaries.every((row) => !row.guaranteedMajority)).toBe(true);
    },
  );

  it('replays selected matrix cells with unchanged atomic support and geography', () => {
    const scenario = createDefaultScenario();
    const fit = calibrate(scenario);
    const original = structuredClone({ scenario, fit });
    for (const policy of ['coalition', 'ordinary'] as const) {
      const matrix = report.matrices[policy];
      for (const index of [0, 127, 389, 779]) {
        const cell = matrix.cells[index];
        const sample = {
          ...scenario,
          lists: partitionLists(
            [...matrix.rows[cell.row].groups, ...matrix.columns[cell.column].groups],
            policy,
          ),
        };
        const result = evaluateScenario(sample, fit);
        expect(cell.outcome.lc).toEqual(allianceBounds(result, allianceIdsForRule(sample, 'L+C')));
        expect(cell.outcome.r).toEqual(allianceBounds(result, allianceIdsForRule(sample, 'R')));
      }
    }
    expect({ scenario, fit }).toEqual(original);
  });

  it('makes a centre joint list qualify at 5% while the same 5.16% fails the 8% policy', () => {
    const find = (policy: CommitteeType) => {
      const matrix = report.matrices[policy];
      const row = matrix.rows.findIndex((item) => item.groups.length === 4);
      const column = matrix.columns.findIndex(
        (item) =>
          item.groups.length === 4 && item.groups.some((group) => group.join('+') === 'pl2050+psl'),
      );
      return matrix.cells.find((cell) => cell.row === row && cell.column === column)!.outcome;
    };
    expect(find('coalition').eligibleIds).not.toContain('pl2050+psl');
    expect(find('coalition').lc).toEqual(exact(226));
    expect(find('ordinary').eligibleIds).toContain('pl2050+psl');
    expect(find('ordinary').lc).toEqual(exact(229));
    expect(find('ordinary').r).toEqual(exact(231));
  });
});

describe('integer support sampling and threshold boundaries', () => {
  it('includes symmetric grids, exact endpoints, current support and threshold neighbours', () => {
    const values = studySampleValues(12_910_000, 250_000, 5_140_000);
    const points = new Map(values.map((point) => [point.xUnits, point]));
    expect(values.map((point) => point.xUnits)).toEqual([...points.keys()].sort((a, b) => a - b));
    expect(points.size).toBe(values.length);
    for (const x of points.keys()) {
      expect(Number.isSafeInteger(x)).toBe(true);
      expect(points.has(12_910_000 - x)).toBe(true);
    }
    for (const x of [0, 12_910_000]) expect(points.get(x)?.kinds).toContain('endpoint');
    expect(points.get(5_140_000)?.kinds).toContain('current');
    for (const x of [5_000_000, 7_910_000]) {
      expect(points.get(x)?.kinds).toContain('threshold');
      expect(points.get(x - 1)?.kinds).toContain('threshold-neighbour');
      expect(points.get(x + 1)?.kinds).toContain('threshold-neighbour');
    }
    const balanced = studySampleValues(51_610_000, 500_000, 33_540_000, true);
    expect(balanced.find((point) => point.xUnits === 25_805_000)?.kinds).toContain('balanced');
  });

  it.each([
    [0, 250_000, 0],
    [100_000_001, 250_000, 0],
    [10_000_000, 0, 0],
    [10_000_000, 0.5, 0],
    [10_000_000, 1, 0],
    [10_000_000, 250_000, -1],
    [10_000_000, 250_000, 10_000_001],
  ])('rejects invalid or excessive sampling %j', (total, step, current) => {
    expect(() => studySampleValues(total, step, current)).toThrow();
  });
});

describe('ceteris-paribus party-pair transfers', () => {
  it.each([
    ['razem', 'nl', 12_910_000, 33, 58, 'lc', 241],
    ['konf', 'kkp', 20_210_000, 94, 105, 'r', 242],
    ['pis', 'rozwoj', 27_670_000, 140, 154, 'r', 243],
  ] as const)(
    'matches independent baseline and sampled maxima for %s versus %s',
    (target, donor, total, baselinePair, maximumPair, block, maximumBlock) => {
      const study = report.pairs.find((pair) => pair.targetId === target)!;
      expect(study.donorId).toBe(donor);
      expect(study.totalUnits).toBe(total);
      expect(study.stepUnits).toBe(250_000);
      expect(study.points[0].xUnits).toBe(0);
      expect(study.points.at(-1)!.xUnits).toBe(total);
      const current = study.points.find((point) => point.xUnits === study.baselineUnits)!;
      expect(current.outcome.lc).toEqual(report.baseline.lc);
      expect(current.outcome.r).toEqual(report.baseline.r);
      expect(current.outcome.pair).toEqual(exact(baselinePair));
      expect(study.summary.pair).toMatchObject({ maximum: maximumPair, resolved: true });
      expect(study.summary[block].maximum).toBe(maximumBlock);
      expect(study.pooled.pair).toEqual(exact(maximumPair));
      expect(study.pooled[block]).toEqual(exact(maximumBlock));
      for (const point of study.points) {
        expect(point.xUnits + point.otherUnits).toBe(total);
        expectChamber(point.outcome);
        const mirror = study.points.find((other) => other.xUnits === point.otherUnits)!;
        expect(mirror.outcome.lc).toEqual(point.outcome.lc);
        expect(mirror.outcome.r).toEqual(point.outcome.r);
        expect(mirror.outcome.pair).toEqual(point.outcome.pair);
      }
    },
  );

  it('preserves every unaffected national target and exact inclusive qualification', () => {
    const scenario = createDefaultScenario();
    for (const pair of report.pairs) {
      const others = scenario.entities.filter(
        (entity) => entity.active && ![pair.targetId, pair.donorId].includes(entity.id),
      );
      const otherExcluded = others
        .filter((entity) => entity.supportUnits < 5_000_000)
        .reduce((sum, entity) => sum + entity.supportUnits, scenario.residual.supportUnits);
      for (const point of pair.points) {
        for (const entity of others)
          expect(point.outcome.eligibleIds.includes(entity.id)).toBe(
            entity.supportUnits >= 5_000_000,
          );
        expect(point.outcome.eligibleIds.includes(pair.targetId)).toBe(point.xUnits >= 5_000_000);
        expect(point.outcome.eligibleIds.includes(pair.donorId)).toBe(
          point.otherUnits >= 5_000_000,
        );
        const excluded =
          otherExcluded +
          (point.xUnits < 5_000_000 ? point.xUnits : 0) +
          (point.otherUnits < 5_000_000 ? point.otherUnits : 0);
        expect(point.outcome.excludedVoteShare).toBeCloseTo((excluded / SUPPORT_TOTAL) * 100, 12);
      }
    }
  });

  it('distinguishes maximising the Konfederacja pair from maximising the whole R block', () => {
    const study = report.pairs.find((pair) => pair.targetId === 'konf')!;
    const point = study.points.find((item) => item.xUnits === 20_000_000)!;
    expect(point.outcome.r).toEqual(exact(242));
    expect(point.outcome.pair).toEqual(exact(103));
    expect(study.summary.r.bestIndices).toContain(study.points.indexOf(point));
    expect(study.summary.pair!.bestIndices).not.toContain(study.points.indexOf(point));
  });

  it('matches manual same-proxy support edits and a pooled-list benchmark', () => {
    const scenario = createDefaultScenario();
    for (const pair of report.pairs) {
      for (const x of [0, 5_000_000, pair.totalUnits]) {
        const sample = redistributeSupport(scenario, pair.targetId, x, [pair.donorId]);
        const result = evaluateScenario(sample);
        const outcome = pair.points.find((point) => point.xUnits === x)!.outcome;
        expect(outcome.lc).toEqual(allianceBounds(result, allianceIdsForRule(sample, 'L+C')));
        expect(outcome.r).toEqual(allianceBounds(result, allianceIdsForRule(sample, 'R')));
        expect(outcome.pair).toEqual(allianceBounds(result, [pair.targetId, pair.donorId]));
      }
      const merged = mergeEntities(scenario, [pair.targetId, pair.donorId], 'coalition');
      const result = evaluateScenario(merged);
      expect(pair.pooled.lc).toEqual(allianceBounds(result, allianceIdsForRule(merged, 'L+C')));
      expect(pair.pooled.r).toEqual(allianceBounds(result, allianceIdsForRule(merged, 'R')));
    }
  });

  it('rejects inactive, mismatched-profile, duplicate and stale-calibration inputs', () => {
    const scenario = createDefaultScenario();
    for (const [target, donor] of [
      ['pps', 'nl'],
      ['ko', 'nl'],
      ['pis', 'konf'],
      ['nl', 'nl'],
      ['nl', 'pis'],
    ])
      expect(() => buildPairStudy(scenario, target, donor)).toThrow();
    const fit = calibrate(scenario);
    const edited = redistributeSupport(scenario, 'razem', 6_000_000, ['nl']);
    expect(() => buildPairStudy(edited, 'razem', 'nl', fit)).toThrow(/kalibracji/);
    expect(() => buildCoalitionMatrix(edited, 'coalition', fit)).toThrow(/kalibracji/);
  });
});

describe('one versus two hypothetical L+C parties', () => {
  it('preserves the combined 51.61% support and fixed R while comparing electoral fragmentation', () => {
    const study = report.concentration;
    expect(study.interpretation).toBe('shared-profile');
    expect(study.totalUnits).toBe(51_610_000);
    expect(study.stepUnits).toBe(500_000);
    expect(study.defaultOutcome).toEqual(report.baseline);
    expect(study.oneParty.lc).toEqual(exact(264));
    expect(study.oneParty.r).toEqual(exact(196));
    expect(study.summary.lc).toMatchObject({ minimum: 250, maximum: 264, resolved: true });
    for (const point of study.points) {
      expect(point.xUnits + point.otherUnits).toBe(51_610_000);
      expectChamber(point.outcome);
      expect(
        point.outcome.eligibleIds
          .filter((id) => ['pis', 'konf', 'kkp', 'rozwoj'].includes(id))
          .sort(),
      ).toEqual(['kkp', 'konf', 'pis', 'rozwoj']);
      const excluded =
        510_000 +
        (point.xUnits < 5_000_000 ? point.xUnits : 0) +
        (point.otherUnits < 5_000_000 ? point.otherUnits : 0);
      expect(point.outcome.excludedVoteShare).toBeCloseTo(excluded / 1_000_000, 12);
      const mirror = study.points.find((other) => other.xUnits === point.otherUnits)!;
      expect(mirror.outcome.lc).toEqual(point.outcome.lc);
      expect(mirror.outcome.r).toEqual(point.outcome.r);
    }
    for (const point of [study.points[0], study.points.at(-1)!]) {
      expect(point.outcome.lc).toEqual(study.oneParty.lc);
      expect(point.outcome.r).toEqual(study.oneParty.r);
    }
  });

  it('resolves block totals even when two equal LC lists tie internally at the cutoff', () => {
    const point = report.concentration.points.find((item) => item.xUnits === 25_805_000)!;
    expect(point.kinds).toContain('balanced');
    expect(point.outcome.allocationStatus).toBe('ambiguous');
    expect(point.outcome.status).toBe('resolved');
    expect(point.outcome.lc).toEqual(exact(255));
    expect(point.outcome.r).toEqual(exact(205));
  });
});

describe('honest extrema under unresolved seat bounds', () => {
  it('does not turn possible maxima into guaranteed best points', () => {
    expect(sampledExtrema([{ lower: 228, upper: 232 }, exact(231), exact(230)])).toEqual({
      minimum: 228,
      maximum: 232,
      maximumLower: 231,
      bestIndices: [],
      possibleBestIndices: [0, 1],
      resolved: false,
    });
    expect(() => sampledExtrema([])).toThrow();
    expect(() => summarizeStudyOutcomes([])).toThrow();
    expect(() =>
      summarizeStudyOutcomes([{ ...report.baseline, status: 'unallocatable' }]),
    ).toThrow();
  });
});
