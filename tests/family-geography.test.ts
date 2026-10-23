import { describe, expect, it } from 'vitest';
import { mergeEntities } from '../src/model/coalitions';
import { IPF_TOLERANCE, SUPPORT_TOTAL } from '../src/model/constants';
import { historicalData } from '../src/model/data';
import { calibratedVotes, evaluateScenario } from '../src/model/engine';
import { calibrate, calibrationFingerprint, poolVotes } from '../src/model/geography';
import {
  parseScenario,
  scenarioFromHash,
  scenarioToHash,
  serializeScenario,
} from '../src/model/persistence';
import { createDefaultScenario, createSyntheticScenario } from '../src/model/presets';
import { summarizeRegionalSupport } from '../src/model/regional';
import { redistributeSupport } from '../src/model/support';
import type { Calibration, Family, Scenario } from '../src/model/types';
import { validateScenario } from '../src/model/validation';

const nationalVotes = historicalData.totals.validVotes2023;
const families: Family[] = ['L', 'R', 'C'];

function familyVotes(scenario: Scenario, fit: Calibration, family: Family): number[] {
  const columns = scenario.entities
    .filter((entity) => entity.family === family)
    .map((entity) => fit.entityIds.indexOf(entity.id));
  return fit.matrix.map((row) => columns.reduce((sum, column) => sum + row[column], 0));
}

/** Check public matrix contracts in normalized national-vote units. */
function expectMargins(scenario: Scenario): Calibration {
  const fit = calibrate(scenario);
  expect(fit.matrix).toHaveLength(41);
  expect(fit.entityIds).toHaveLength(11);
  expect(new Set(fit.entityIds).size).toBe(11);
  expect(fit.maxError).toBeLessThanOrEqual(IPF_TOLERANCE);
  for (const [index, row] of fit.matrix.entries()) {
    expect(row).toHaveLength(fit.entityIds.length);
    expect(row.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(
      Math.abs(
        (row.reduce((sum, value) => sum + value, 0) -
          historicalData.districts[index].validVotes2023) /
          nationalVotes,
      ),
    ).toBeLessThanOrEqual(IPF_TOLERANCE);
  }
  for (const [column, id] of fit.entityIds.entries()) {
    const target =
      id === '__residual'
        ? scenario.residual.supportUnits
        : scenario.entities.find((entity) => entity.id === id)!.supportUnits;
    const total = fit.matrix.reduce((sum, row) => sum + row[column], 0);
    expect(Math.abs(total / nationalVotes - target / SUPPORT_TOTAL)).toBeLessThanOrEqual(
      IPF_TOLERANCE,
    );
    if (target === 0) expect(fit.matrix.every((row) => row[column] === 0)).toBe(true);
  }
  return fit;
}

describe('2023 geography fitted within political families', () => {
  it('reports failed convergence without substituting another geography', () => {
    expect(() => calibrate(createDefaultScenario(), 1)).toThrow(/Kalibracja IPF/);
  });

  it.each([createDefaultScenario, createSyntheticScenario])(
    'preserves every poll target, district electorate and inactive zero for %s',
    (createScenario) => {
      const scenario = createScenario();
      expect(scenario.geographyMode).toBe('family');
      expectMargins(scenario);
    },
  );

  it.each([
    ['L', 'nl', 9_770_000, 'ko'],
    ['R', 'konf', 14_180_000, 'pis'],
    ['C', 'psl', 4_440_000, 'pl2050'],
  ] as const)(
    'keeps every local camp electorate fixed when support moves within %s',
    (changedFamily, target, support, donor) => {
      const original = createDefaultScenario();
      const changed = redistributeSupport(original, target, support, [donor]);
      const before = expectMargins(original);
      const after = expectMargins(changed);
      for (const family of families) {
        const originalVotes = familyVotes(original, before, family);
        const changedVotes = familyVotes(changed, after, family);
        for (let row = 0; row < originalVotes.length; row++)
          expect(
            Math.abs((originalVotes[row] - changedVotes[row]) / nationalVotes),
          ).toBeLessThanOrEqual(IPF_TOLERANCE);
      }
      for (const entity of original.entities.filter((entity) => entity.family !== changedFamily)) {
        const column = before.entityIds.indexOf(entity.id);
        expect(after.matrix.map((row) => row[column])).toEqual(
          before.matrix.map((row) => row[column]),
        );
      }
      const residualColumn = before.entityIds.indexOf('__residual');
      expect(after.matrix.map((row) => row[residualColumn])).toEqual(
        before.matrix.map((row) => row[residualColumn]),
      );
    },
  );

  it('retains differences between regions and within-family historical profiles', () => {
    const scenario = createDefaultScenario();
    const fit = expectMargins(scenario);
    const left = familyVotes(scenario, fit, 'L');
    const regionalLeftShares = left.map(
      (votes, row) => votes / historicalData.districts[row].validVotes2023,
    );
    expect(Math.max(...regionalLeftShares) - Math.min(...regionalLeftShares)).toBeGreaterThan(0.2);
    const ko = fit.entityIds.indexOf('ko');
    const nl = fit.entityIds.indexOf('nl');
    const koToNl = fit.matrix.map((row) => row[ko] / row[nl]);
    expect(Math.max(...koToNl) / Math.min(...koToNl)).toBeGreaterThan(2);

    // Independently calculated with a stdlib Python nested fit (tolerance 1e-14).
    const warsawRow = historicalData.districts.findIndex((district) => district.id === 19);
    const warsawVotes = historicalData.districts[warsawRow].validVotes2023;
    expect((left[warsawRow] / warsawVotes) * 100).toBeCloseTo(64.987, 3);
    expect((familyVotes(scenario, fit, 'R')[warsawRow] / warsawVotes) * 100).toBeCloseTo(29.926, 3);
    expect((familyVotes(scenario, fit, 'C')[warsawRow] / warsawVotes) * 100).toBeCloseTo(4.593, 3);
  });

  it('does not invent a regional distinction between parties sharing the TD proxy', () => {
    const scenario = createDefaultScenario();
    const fit = expectMargins(scenario);
    const psl = fit.entityIds.indexOf('psl');
    const pl2050 = fit.entityIds.indexOf('pl2050');
    for (const row of fit.matrix) expect(row[psl] / row[pl2050]).toBeCloseTo(2, 12);
  });

  it.each(families)('handles a completely empty %s family without NaN or lost votes', (family) => {
    let scenario = createDefaultScenario();
    const donor = family === 'R' ? 'ko' : 'pis';
    for (const entity of scenario.entities.filter(
      (entity) => entity.family === family && entity.active,
    ))
      scenario = redistributeSupport(scenario, entity.id, 0, [donor]);
    const fit = expectMargins(scenario);
    expect(familyVotes(scenario, fit, family).every((votes) => votes === 0)).toBe(true);
    const result = evaluateScenario(scenario, fit);
    expect(result.status).toBe('resolved');
    expect(Object.values(result.nationalListSeats).reduce((sum, seats) => sum + seats, 0)).toBe(
      460,
    );
  });

  it('preserves the smallest nonzero support target even when it is the entire family', () => {
    let scenario = createDefaultScenario();
    scenario = redistributeSupport(scenario, 'pl2050', 0, ['pis']);
    scenario = redistributeSupport(scenario, 'psl', 1, ['pis']);
    const fit = expectMargins(scenario);
    const column = fit.entityIds.indexOf('psl');
    expect(fit.matrix.every((row) => row[column] > 0)).toBe(true);
    const actualUnits =
      (fit.matrix.reduce((sum, row) => sum + row[column], 0) / nationalVotes) * SUPPORT_TOTAL;
    expect(actualUnits).toBeCloseTo(1, 6);
  });

  it('preserves atomic geography across list pooling, order and turnout changes', () => {
    const scenario = createDefaultScenario();
    const fit = calibratedVotes(scenario);
    const merged = mergeEntities(scenario, ['nl', 'razem']);
    const reordered = { ...scenario, entities: [...scenario.entities].reverse() };
    expect(calibratedVotes(merged)).toBe(fit);
    expect(calibratedVotes({ ...scenario, turnout: 0.5 })).toBe(fit);
    expect(calibratedVotes(reordered)).toBe(fit);
    expect(calibrate(reordered).matrix).toEqual(fit.matrix);
    const originalVotes = poolVotes(scenario, fit);
    const mergedVotes = poolVotes(merged, fit);
    for (let row = 0; row < fit.matrix.length; row++) {
      expect(mergedVotes[row]['nl+razem']).toBe(originalVotes[row].nl + originalVotes[row].razem);
      expect(mergedVotes[row].ko).toBe(originalVotes[row].ko);
      expect(mergedVotes[row].pis).toBe(originalVotes[row].pis);
    }
    expect(evaluateScenario({ ...scenario, turnout: 0.5 }).nationalListSeats).toEqual(
      evaluateScenario(scenario).nationalListSeats,
    );
  });

  it('keeps camp-based, legacy party-based and uniform assumptions distinguishable', () => {
    const scenario = createDefaultScenario();
    const family = expectMargins(scenario);
    const historical = expectMargins({ ...scenario, geographyMode: 'historical' });
    const uniform = expectMargins({ ...scenario, geographyMode: 'uniform' });
    expect(family.matrix).not.toEqual(historical.matrix);
    expect(family.matrix).not.toEqual(uniform.matrix);
    expect(family.fingerprint).not.toBe(historical.fingerprint);
    expect(family.fingerprint).not.toBe(uniform.fingerprint);
    for (const entity of scenario.entities) {
      const column = uniform.entityIds.indexOf(entity.id);
      for (const [row, district] of historicalData.districts.entries())
        expect(uniform.matrix[row][column] / district.validVotes2023).toBeCloseTo(
          entity.supportUnits / SUPPORT_TOTAL,
          12,
        );
    }
  });

  it('includes family assignments in the calibration identity', () => {
    const scenario = createDefaultScenario();
    const reassigned = structuredClone(scenario);
    reassigned.entities.find((entity) => entity.id === 'ko')!.family = 'C';
    expect(calibrationFingerprint(reassigned)).not.toBe(calibrationFingerprint(scenario));
    // The production import contract continues to prohibit changing the fixed camp slots.
    expect(() => validateScenario(reassigned)).toThrow(/grupa/);
  });

  it('reproduces the independently calculated new baseline through the whole seat pipeline', () => {
    const result = evaluateScenario(createDefaultScenario());
    expect(result.status).toBe('resolved');
    expect(result.campSeats).toEqual({ L: 226, R: 234, C: 0 });
    expect(result.nationalListSeats).toEqual({
      ko: 193,
      nl: 27,
      razem: 6,
      pis: 127,
      konf: 58,
      kkp: 36,
      rozwoj: 13,
      psl: 0,
      pl2050: 0,
    });
  });
});

describe('regional electorate summaries', () => {
  it('uses vote-weighted national averages rather than the arithmetic mean of districts', () => {
    const scenario = createDefaultScenario();
    const summary = summarizeRegionalSupport(scenario, calibrate(scenario));
    for (const family of families) {
      const weightedMean = summary.districts.reduce(
        (sum, district) =>
          sum +
          (district.projectedShares[family] *
            historicalData.districts.find((source) => source.id === district.districtId)!
              .validVotes2023) /
            nationalVotes,
        0,
      );
      expect(summary.families[family].projectedShare).toBeCloseTo(weightedMean, 12);
      expect(summary.families[family].projectedShare).toBeCloseTo(
        summary.families[family].targetShare,
        12,
      );
    }
    const arithmeticMean =
      summary.districts.reduce((sum, district) => sum + district.projectedShares.L, 0) /
      summary.districts.length;
    expect(Math.abs(arithmeticMean - summary.families.L.projectedShare)).toBeGreaterThan(0.001);
    expect(summary.maxError).toBeLessThanOrEqual(IPF_TOLERANCE);
  });

  it('retains residual and other historical votes in denominators without relabelling them', () => {
    const scenario = createDefaultScenario();
    const fit = calibrate(scenario);
    const summary = summarizeRegionalSupport(scenario, fit);
    const residual = summary.national.find((entity) => entity.id === '__residual')!;
    expect(residual.targetShare).toBe(0.0051);
    expect(residual.projectedShare).toBeCloseTo(0.0051, 12);
    expect(summary.national.reduce((sum, entity) => sum + entity.projectedShare, 0)).toBeCloseTo(
      1,
      12,
    );
    expect(
      families.reduce((sum, family) => sum + summary.families[family].projectedShare, 0),
    ).toBeCloseTo(0.9949, 12);
    for (const [row, district] of summary.districts.entries()) {
      const source = historicalData.districts[row];
      const historicalOutsideVotes = Object.entries(source.votesByCommittee)
        .filter(([id]) => !['ko', 'nl', 'pis', 'konf', 'td'].includes(id))
        .reduce((sum, [, votes]) => sum + votes, 0);
      expect(
        families.reduce((sum, family) => sum + district.historicalShares[family], 0),
      ).toBeCloseTo(1 - historicalOutsideVotes / source.validVotes2023, 12);
      const projectedResidual = fit.matrix[row][fit.entityIds.indexOf('__residual')];
      expect(
        families.reduce((sum, family) => sum + district.projectedShares[family], 0),
      ).toBeCloseTo(1 - projectedResidual / source.validVotes2023, 11);
    }
  });

  it('keeps centre electorate geography separate when a centre party joins a left list', () => {
    const scenario = createDefaultScenario();
    const fit = calibrate(scenario);
    const summary = summarizeRegionalSupport(scenario, fit);
    const merged = mergeEntities(scenario, ['ko', 'psl']);
    expect(summarizeRegionalSupport(merged, fit)).toEqual(summary);
    expect(summary.families.C.targetShare).toBe(0.0516);
    expect(summary.families.C.projectedShare).toBeCloseTo(0.0516, 12);
  });

  it('rejects an atomic calibration from a different support scenario', () => {
    const scenario = createDefaultScenario();
    const changed = redistributeSupport(scenario, 'nl', 9_770_000, ['ko']);
    expect(() => summarizeRegionalSupport(changed, calibrate(scenario))).toThrow(/kalibracji/);
  });
});

describe('geography version and state compatibility', () => {
  it('roundtrips the new family mode through JSON and share links', () => {
    const scenario = createDefaultScenario();
    expect(scenario.modelVersion).toBe('1.1.0');
    expect(parseScenario(serializeScenario(scenario))).toEqual(scenario);
    expect(scenarioFromHash(scenarioToHash(scenario))).toEqual(scenario);
  });

  it.each(['historical', 'uniform'] as const)(
    'retains version 1.0.0 %s shares without silently applying the new geography',
    (geographyMode) => {
      const legacy = { ...createDefaultScenario(), modelVersion: '1.0.0', geographyMode };
      expect(validateScenario(legacy)).toEqual(legacy);
      expect(parseScenario(serializeScenario(legacy))).toEqual(legacy);
      expect(scenarioFromHash(scenarioToHash(legacy))).toEqual(legacy);
      const current = { ...legacy, modelVersion: '1.1.0' };
      expect(calibrate(legacy).matrix).toEqual(calibrate(current).matrix);
      expect(evaluateScenario(legacy).nationalListSeats).toEqual(
        evaluateScenario(current).nationalListSeats,
      );
    },
  );

  it('rejects an old version claiming the newly introduced family mode', () => {
    const invalid = { ...createDefaultScenario(), modelVersion: '1.0.0' };
    expect(() => validateScenario(invalid)).toThrow();
    expect(() => parseScenario(JSON.stringify(invalid))).toThrow();
  });
});
