import { describe, expect, it } from 'vitest';
import { allianceBounds, allianceIdsForRule } from '../src/model/alliances';
import { enumeratePartitions, mergeEntities, partitionLists, separateAll, splitEntity } from '../src/model/coalitions';
import { SUPPORT_TOTAL } from '../src/model/constants';
import { baselineTurnout, historicalData, maxTurnout, maxTurnoutSliderPct } from '../src/model/data';
import { allocateDistrict, districtAllianceBounds } from '../src/model/dhondt';
import { determineEligibility } from '../src/model/eligibility';
import { calibratedVotes, evaluateScenario, replayHistorical } from '../src/model/engine';
import { calibrate, poolVotes } from '../src/model/geography';
import { createDefaultScenario, createSyntheticScenario } from '../src/model/presets';
import { defaultDonors, distributeUnits, equalizeSupport, formatSupport, parseSupport, redistributeSupport, setEntityActive } from '../src/model/support';
import { validateScenario } from '../src/model/validation';

describe('official historical replay', () => {
  it('reproduces national AND all independent district allocations', () => {
    const result = replayHistorical();
    expect(result.status).toBe('resolved');
    expect(result.nationalListSeats).toEqual(historicalData.officialSeats.national);
    expect(result.nationalListSeats).toMatchObject({ pis: 194, ko: 157, td: 65, nl: 26, konf: 18, mn: 0 });
    expect(result.districtAllocations).toHaveLength(41);
    for (const district of result.districtAllocations) {
      expect(district.seatsByList).toEqual(historicalData.officialSeats.districts[String(district.districtId)]);
      expect(Object.values(district.seatsByList).reduce((sum, seats) => sum + seats, 0)).toBe(historicalData.districts.find((data) => data.id === district.districtId)!.seats);
    }
    expect(Object.values(result.nationalListSeats).reduce((sum, seats) => sum + seats, 0)).toBe(460);
  });
});

describe('exact support and state invariants', () => {
  it('parses decimal strings to exact units and rejects excessive precision', () => {
    expect(parseSupport('4.999999')).toBe(4_999_999);
    expect(parseSupport('5,000001')).toBe(5_000_001);
    expect(parseSupport('100')).toBe(SUPPORT_TOTAL);
    for (const invalid of ['NaN', '-1', '101', '1e1', '1.0000001']) expect(() => parseSupport(invalid)).toThrow();
    expect(formatSupport(10_000_000)).toBe('10');
    expect(formatSupport(5_140_000)).toBe('5.14');
  });

  it('uses exact BigInt remainders and stable IDs at large products', () => {
    const weights = [{ id: 'b', weight: 33_333_333 }, { id: 'a', weight: 33_333_333 }, { id: 'c', weight: 33_333_334 }];
    expect(distributeUnits(99_999_999, weights)).toEqual({ a: 33_333_333, b: 33_333_333, c: 33_333_333 });
    expect(distributeUnits(99_999_999, [...weights].reverse())).toEqual(distributeUnits(99_999_999, weights));
    expect(distributeUnits(1, [{ id: 'z', weight: 1 }, { id: 'a', weight: 1 }])).toEqual({ a: 1, z: 0 });
  });

  it('conserves support, preserves locks and leaves residual unchanged', () => {
    const original = createDefaultScenario();
    original.entities.find((entity) => entity.id === 'ko')!.locked = true;
    const donors = defaultDonors(original, 'razem');
    expect(donors).not.toContain('ko');
    const next = redistributeSupport(original, 'razem', 7_000_001, donors);
    expect(next.entities.reduce((sum, entity) => sum + entity.supportUnits, next.residual.supportUnits)).toBe(SUPPORT_TOTAL);
    expect(next.entities.find((entity) => entity.id === 'razem')!.supportUnits).toBe(7_000_001);
    expect(next.entities.find((entity) => entity.id === 'ko')!.supportUnits).toBe(33_540_000);
    expect(next.entities.find((entity) => entity.id === 'pps')!.supportUnits).toBe(0);
    expect(next.residual).toEqual(original.residual);
    expect(next.entities.find((entity) => entity.id === 'razem')!.publishedPollSharePct).toBe(5.14);
    expect(validateScenario(next)).toEqual(next);
  });

  it('explicit donors preserve family totals and reject exhausted pools', () => {
    const scenario = createDefaultScenario();
    const next = redistributeSupport(scenario, 'razem', 6_000_000, ['nl']);
    expect(next.entities.find((entity) => entity.id === 'nl')!.supportUnits).toBe(6_910_000);
    expect(() => redistributeSupport(scenario, 'razem', 15_000_000, ['nl'])).toThrow(/pula/);
    expect(() => redistributeSupport(scenario, 'razem', 4_000_000, [])).toThrow(/zerowe/);
    expect(() => setEntityActive(scenario, 'nl', false)).toThrow(/przenieś/);
    const activated = setEntityActive(scenario, 'pps', true);
    expect(activated.entities.find((entity) => entity.id === 'pps')!.supportUnits).toBe(0);
    expect(validateScenario(activated)).toEqual(activated);
  });

  it('synthetic equalization conserves the selected family and labels assumptions', () => {
    const scenario = createSyntheticScenario();
    const next = equalizeSupport(scenario, ['nl', 'razem', 'pps']);
    expect(next.entities.filter((entity) => ['nl', 'razem', 'pps'].includes(entity.id)).map((entity) => entity.supportUnits)).toEqual([4_303_334, 4_303_333, 4_303_333]);
    expect(validateScenario(next)).toEqual(next);
  });

  it('rejects unsafe imports, invalid partitions and obsolete alliance IDs', () => {
    const scenario = createDefaultScenario();
    expect(() => validateScenario(null)).toThrow();
    expect(() => validateScenario({ ...scenario, modelVersion: 'future' })).toThrow(/wersja/);
    expect(() => validateScenario({ ...scenario, turnout: NaN })).toThrow(/frekwencja/);
    expect(() => validateScenario({ ...scenario, residual: { ...scenario.residual, supportUnits: 1_000_000 } })).toThrow(/reszta/);
    expect(() => validateScenario({ ...scenario, lists: [...scenario.lists, scenario.lists[0]] })).toThrow();
    expect(() => validateScenario({ ...scenario, allianceSelection: ['missing'] })).toThrow(/sojusz/);
    const exemption = structuredClone(scenario);
    exemption.lists[0].minorityExempt = true;
    expect(() => validateScenario(exemption)).toThrow(/zwolnienia/);
    const duplicate = structuredClone(scenario);
    duplicate.entities[1] = duplicate.entities[0];
    expect(() => validateScenario(duplicate)).toThrow(/ID/);
  });
});

describe('national eligibility', () => {
  const input = (id: string, votes: number, committeeType: 'ordinary' | 'coalition' = 'ordinary', minorityExempt = false) => ({ id, votes, committeeType, minorityExempt });
  it('uses inclusive exact 5%/8% and retains all below-threshold votes in denominator', () => {
    const { eligibility, thresholdRegime } = determineEligibility([input('a', 5_000_000), input('b', 8_000_000, 'coalition'), input('c', 4_999_999), input('d', 7_999_999, 'coalition')]);
    expect(thresholdRegime).toBe('normal');
    expect(eligibility.a.eligible).toBe(true);
    expect(eligibility.b.eligible).toBe(true);
    expect(eligibility.c.eligible).toBe(false);
    expect(eligibility.d.eligible).toBe(false);
  });

  it('does not count a below-threshold minority exemption toward the fallback trigger', () => {
    const { eligibility, thresholdRegime } = determineEligibility([input('a', 80_000_000), input('b', 3_000_000), input('c', 5_000_000, 'coalition'), input('m', 1_000_000, 'ordinary', true)]);
    expect(thresholdRegime).toBe('fallback');
    expect(Object.values(eligibility).every((entry) => entry.eligible)).toBe(true);
    expect(eligibility.b.thresholdPct).toBe(3);
    expect(eligibility.c.thresholdPct).toBe(5);
    const secondOrdinary = determineEligibility([input('a', 80_000_000), input('b', 5_000_000), input('m', 1_000_000, 'ordinary', true)]);
    expect(secondOrdinary.thresholdRegime).toBe('normal');
  });
});

describe('d’Hondt and boundary uncertainty', () => {
  it.each([
    [[5.1, 2.8, 46, 46.1], 'coalition', [1, 0, 9, 10], [0, 10, 10]],
    [[5.1, 2.8, 46, 46.1], 'ordinary', [1, 0, 9, 10], [1, 9, 10]],
    [[3, 3, 47.1, 46.9], 'ordinary', [0, 0, 10, 10], [1, 10, 9]],
    [[10, 10, 40.1, 39.9], 'coalition', [2, 2, 8, 8], [4, 8, 8]],
    [[8, 8, 42.1, 41.9], 'coalition', [1, 1, 9, 9], [3, 9, 8]],
  ] as const)('reproduces synthetic fixture %j (%s)', (shares, type, separateSeats, mergedSeats) => {
    const separate = shares.map((share, index) => ({ id: String(index), votes: Math.round(share * 1_000_000), committeeType: 'ordinary' as const, minorityExempt: false }));
    const separateEligibility = determineEligibility(separate).eligibility;
    const allocation = allocateDistrict(Object.fromEntries(separate.filter((list) => separateEligibility[list.id].eligible).map((list) => [list.id, list.votes])), 20, 1, true);
    expect(separate.map((list) => allocation.seatsByList[list.id] ?? 0)).toEqual(separateSeats);
    const merged = [{ ...separate[0], id: 'AB', votes: separate[0].votes + separate[1].votes, committeeType: type }, separate[2], separate[3]];
    const mergedEligibility = determineEligibility(merged).eligibility;
    const mergedAllocation = allocateDistrict(Object.fromEntries(merged.filter((list) => mergedEligibility[list.id].eligible).map((list) => [list.id, list.votes])), 20, 1, true);
    expect(merged.map((list) => mergedAllocation.seatsByList[list.id] ?? 0)).toEqual(mergedSeats);
    expect(mergedAllocation.status).toBe('resolved');
  });

  it('uses the higher district vote total for exact quotient ties', () => {
    const result = allocateDistrict({ small: 100, large: 200 }, 2, 1, true);
    expect(result.status).toBe('resolved');
    expect(result.seatsByList).toEqual({ large: 2, small: 0 });
  });

  it('retains precinct-level ties and correlated alliance bounds', () => {
    const result = allocateDistrict({ a: 100, b: 100, c: 100 }, 2, 1, true);
    expect(result.status).toBe('ambiguous');
    expect(result.unresolved).toEqual({ seats: 2, listIds: ['a', 'b', 'c'], reason: 'precinct-tie' });
    expect(districtAllianceBounds(result, ['a', 'b'])).toEqual({ lower: 1, upper: 2 });
    expect(districtAllianceBounds(result, ['a', 'b', 'c'])).toEqual({ lower: 2, upper: 2 });
    expect(districtAllianceBounds(result, ['a'])).toEqual({ lower: 0, upper: 1 });
  });

  it('reports projected near ties as numerical ambiguity without a legal tie-break', () => {
    const near = allocateDistrict({ a: 200 + 1e-11, b: 100 }, 2);
    expect(near.status).toBe('ambiguous');
    expect(near.unresolved?.reason).toBe('numerical');
    expect(near.seatsByList).toEqual({ a: 1, b: 0 });
    expect(allocateDistrict({ b: 100, a: 200 + 1e-11 }, 2).seatBounds).toEqual(near.seatBounds);
  });

  it('does not invent seats when all eligible votes are zero', () => {
    expect(allocateDistrict({ a: 0 }, 10).status).toBe('unallocatable');
    expect(allocateDistrict({}, 10).trace).toEqual([]);
  });

  it('pooling cannot reduce combined mandates in deterministic tie-free samples', () => {
    let checked = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const votes = { a: 1000 + seed * 137, b: 1201 + seed * 57, c: 4523 + seed * 97, d: 5171 + seed * 23 };
      const separate = allocateDistrict(votes, 20, 1, true);
      const merged = allocateDistrict({ ab: votes.a + votes.b, c: votes.c, d: votes.d }, 20, 1, true);
      if (separate.status !== 'resolved' || merged.status !== 'resolved') continue;
      expect(merged.seatsByList.ab).toBeGreaterThanOrEqual(separate.seatsByList.a + separate.seatsByList.b);
      checked++;
    }
    expect(checked).toBeGreaterThan(90);
  });
});

describe('geography, pooling and turnout', () => {
  it('fits both margins and preserves exact zero columns', () => {
    const scenario = createDefaultScenario();
    const fit = calibrate(scenario);
    expect(fit.iterations).toBe(9);
    expect(fit.maxError).toBeLessThan(3.5e-13);
    const total = historicalData.totals.validVotes2023;
    for (let row = 0; row < fit.matrix.length; row++) expect(Math.abs(fit.matrix[row].reduce((sum, value) => sum + value, 0) / total - historicalData.districts[row].validVotes2023 / total)).toBeLessThanOrEqual(1e-12);
    for (let column = 0; column < fit.entityIds.length; column++) {
      const id = fit.entityIds[column];
      const target = id === '__residual' ? scenario.residual.supportUnits : scenario.entities.find((entity) => entity.id === id)!.supportUnits;
      const actual = fit.matrix.reduce((sum, row) => sum + row[column], 0) / total;
      expect(Math.abs(actual - target / SUPPORT_TOTAL)).toBeLessThanOrEqual(1e-12);
      if (id === 'pps') expect(fit.matrix.every((row) => row[column] === 0)).toBe(true);
    }
    expect(() => calibrate(scenario, 1)).toThrow(/IPF/);
  });

  it('uniform geography has identical shares in every district', () => {
    const scenario = { ...createDefaultScenario(), geographyMode: 'uniform' as const };
    const fit = calibrate(scenario);
    const column = fit.entityIds.indexOf('ko');
    for (let row = 0; row < fit.matrix.length; row++) expect(fit.matrix[row][column] / historicalData.districts[row].validVotes2023).toBeCloseTo(0.3354, 12);
  });

  it('reuses atomic calibration and pools votes without changing opponents', () => {
    const scenario = createDefaultScenario();
    const fit = calibratedVotes(scenario);
    const merged = mergeEntities(scenario, ['nl', 'razem']);
    expect(calibratedVotes(merged)).toBe(fit);
    const originalVotes = poolVotes(scenario, fit);
    const mergedVotes = poolVotes(merged, fit);
    for (let row = 0; row < originalVotes.length; row++) {
      expect(mergedVotes[row]['nl+razem']).toBe(originalVotes[row].nl + originalVotes[row].razem);
      expect(mergedVotes[row].ko).toBe(originalVotes[row].ko);
    }
  });

  it('preserves all results under turnout scaling and derives the literal ceiling', () => {
    const scenario = createDefaultScenario();
    expect(scenario.turnout).toBe(baselineTurnout);
    expect(maxTurnout * 100).toBeCloseTo(85.8375467, 6);
    expect(maxTurnoutSliderPct).toBe(85.83);
    const original = evaluateScenario(scenario);
    const lower = evaluateScenario({ ...scenario, turnout: 0.5 });
    expect(lower.nationalListSeats).toEqual(original.nationalListSeats);
    expect(lower.eligibility).toEqual(original.eligibility);
    expect(() => evaluateScenario({ ...scenario, turnout: 0 })).toThrow();
    expect(() => evaluateScenario({ ...scenario, turnout: maxTurnout + 1e-8 })).toThrow();
  });
});

describe('permitted partitions and political accounting', () => {
  it('counts canonical partitions exactly with inactive PPS excluded', () => {
    const polling = enumeratePartitions(createDefaultScenario().entities);
    const synthetic = enumeratePartitions(createSyntheticScenario().entities);
    expect(polling).toHaveLength(2385);
    expect(synthetic).toHaveLength(8378);
    const counts = Array.from({ length: 9 }, (_, index) => synthetic.filter((partition) => partition.length === index + 2).length);
    expect(counts).toEqual([4, 131, 1075, 2713, 2807, 1324, 294, 29, 1]);
    expect(new Set(synthetic.map((partition) => JSON.stringify(partition))).size).toBe(synthetic.length);
    for (const partition of polling) expect(() => validateScenario({ ...createDefaultScenario(), lists: partitionLists(partition, 'coalition') })).not.toThrow();
  });

  it('prevents forbidden L-R combinations even with centre as bridge', () => {
    const scenario = createDefaultScenario();
    expect(() => mergeEntities(scenario, ['ko', 'pis'])).toThrow(/L i R/);
    expect(() => mergeEntities(scenario, ['ko', 'psl', 'pis'])).toThrow(/L i R/);
    expect(() => mergeEntities(scenario, ['ko', 'ko'])).toThrow();
  });

  it('drops changed-list alliance selections and preserves unchanged ones', () => {
    const scenario = createDefaultScenario();
    scenario.allianceSelection = ['ko', 'nl', 'razem'];
    const merged = mergeEntities(scenario, ['nl', 'razem']);
    expect(merged.allianceSelection).toEqual(['ko']);
    expect(merged.lists.find((list) => list.id === 'nl+razem')!.committeeType).toBe('coalition');
    merged.allianceSelection.push('nl+razem');
    const split = splitEntity(merged, 'razem');
    expect(split.allianceSelection).toEqual(['ko']);
    expect(split.lists.find((list) => list.id === 'nl')!.committeeType).toBe('coalition');
    expect(split.lists.find((list) => list.id === 'razem')!.committeeType).toBe('ordinary');
    expect(separateAll(merged).lists.every((list) => list.committeeType === 'ordinary')).toBe(true);
  });

  it.each([
    [[], 'ordinary', { L: 228, R: 232, C: 0 }],
    [['nl', 'razem'], 'coalition', { L: 244, R: 216, C: 0 }],
    [['psl', 'pl2050'], 'coalition', { L: 228, R: 232, C: 0 }],
    [['psl', 'pl2050'], 'ordinary', { L: 225, R: 229, C: 6 }],
    [['ko', 'nl', 'razem'], 'coalition', { L: 253, R: 207, C: 0 }],
    [['pis', 'konf', 'kkp', 'rozwoj'], 'coalition', { L: 195, R: 265, C: 0 }],
  ] as const)('reproduces PRD projection %j under %s', (members, type, expected) => {
    const baseline = createDefaultScenario();
    const scenario = members.length ? mergeEntities(baseline, [...members], type) : baseline;
    const result = evaluateScenario(scenario);
    expect(result.status).toBe('resolved');
    expect(result.campSeats).toEqual(expected);
    expect(Object.values(result.nationalListSeats).reduce((sum, seats) => sum + seats, 0)).toBe(460);
  });

  it('reports merger gain separately from net camp gain and centre alternatives', () => {
    const baseline = createDefaultScenario();
    const result = evaluateScenario(baseline);
    expect(result.nationalListSeats).toEqual({ ko: 195, nl: 27, razem: 6, pis: 127, konf: 57, kkp: 35, rozwoj: 13, psl: 0, pl2050: 0 });
    const merged = evaluateScenario(mergeEntities(baseline, ['nl', 'razem']));
    expect(merged.nationalListSeats['nl+razem']).toBe(59);
    expect(merged.nationalListSeats.ko).toBe(185);
    expect(merged.campSeats.L - result.campSeats.L).toBe(16);
    const centre = mergeEntities(baseline, ['psl', 'pl2050'], 'ordinary');
    const centreResult = evaluateScenario(centre);
    expect(allianceBounds(centreResult, allianceIdsForRule(centre, 'L+C'))).toEqual({ lower: 231, upper: 231 });
    expect(allianceBounds(centreResult, allianceIdsForRule(centre, 'R+C'))).toEqual({ lower: 235, upper: 235 });
  });

  it('is invariant to entity and list ordering', () => {
    const scenario = createDefaultScenario();
    const result = evaluateScenario(scenario);
    const reordered = evaluateScenario({ ...scenario, entities: [...scenario.entities].reverse(), lists: [...scenario.lists].reverse() });
    expect(reordered.nationalListSeats).toEqual(result.nationalListSeats);
    expect(reordered.campSeats).toEqual(result.campSeats);
  });
});
