import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeEntities, scenarioFingerprint } from '../src/model/coalitions';
import { baselineTurnout } from '../src/model/data';
import * as engine from '../src/model/engine';
import { evaluateScenario } from '../src/model/engine';
import { exportResultsCsv, parseScenario, scenarioFromHash, scenarioId, scenarioToHash, serializeScenario } from '../src/model/persistence';
import { createDefaultScenario } from '../src/model/presets';
import { axisValues, heatCell, scenarioAt, summarizePoint, sweepValues, transitionBetween, validateHeatAxes, type Axis } from '../src/model/sensitivity';
import { isCurrentResponse } from '../src/workers/protocol';

const defaultAxis: Axis = { targetId: 'razem', donorId: 'nl', min: 4_900_000, max: 5_100_000, step: 10_000 };
const yAxis: Axis = { targetId: 'rozwoj', donorId: 'pis', min: 4_900_000, max: 5_100_000, step: 10_000 };

afterEach(() => vi.restoreAllMocks());

describe('sensitivity paths and thresholds', () => {
  it('constructs exact integer grids with explicit endpoint and sample caps', () => {
    expect(axisValues({ ...defaultAxis, min: 0, max: 10, step: 3 })).toEqual([0, 3, 6, 9, 10]);
    expect(() => axisValues({ ...defaultAxis, step: 1 })).toThrow(/Limit/);
    expect(() => axisValues({ ...defaultAxis, min: 0, max: 20001, step: 10 })).toThrow(/Limit/);
    expect(() => axisValues({ ...defaultAxis, min: 0.5 })).toThrow();
    expect(() => axisValues({ ...defaultAxis, targetId: 'nl' })).toThrow(/różni/);
  });

  it('samples exact target thresholds and their ±1 representable neighbours', () => {
    const scenario = createDefaultScenario();
    const { values, thresholds } = sweepValues(scenario, defaultAxis);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual(expect.arrayContaining([4_999_999, 5_000_000, 5_000_001]));
    expect(thresholds.has(5_000_000)).toBe(true);
    expect(evaluateScenario(scenarioAt(scenario, defaultAxis, 4_999_999)).eligibility.razem.eligible).toBe(false);
    expect(evaluateScenario(scenarioAt(scenario, defaultAxis, 5_000_000)).eligibility.razem.eligible).toBe(true);
  });

  it('detects a donor-list threshold and does not falsely label inactive fallback thresholds', () => {
    const scenario = createDefaultScenario();
    const donor = sweepValues(scenario, { ...defaultAxis, min: 7_900_000, max: 7_920_000 });
    expect(donor.values).toEqual(expect.arrayContaining([7_909_999, 7_910_000, 7_910_001]));
    expect(donor.thresholds.has(7_910_000)).toBe(true);
    const inactiveFallback = sweepValues(scenario, { ...defaultAxis, min: 2_990_000, max: 3_010_000 });
    expect(inactiveFallback.thresholds.has(3_000_000)).toBe(false);
  });

  it('does not invent a crossing when target and donor share a list', () => {
    const scenario = mergeEntities(createDefaultScenario(), ['nl', 'razem']);
    expect(sweepValues(scenario, defaultAxis).thresholds.size).toBe(0);
  });

  it('counts threshold probes in the 2001-sample cap', () => {
    const axis = { ...defaultAxis, min: 4_000_000, max: 6_000_000, step: 1000 };
    expect(axisValues(axis)).toHaveLength(2001);
    expect(() => sweepValues(createDefaultScenario(), axis)).toThrow(/2001/);
  });

  it('constructs each sample independently and leaves the frozen input unchanged', () => {
    const scenario = createDefaultScenario();
    const before = structuredClone(scenario);
    const values = [4_999_999, 5_000_000, 5_000_001, 5_140_000, 6_123_457];
    const forward = new Map(values.map((value) => [value, scenarioAt(scenario, defaultAxis, value)]));
    const reverse = new Map([...values].reverse().map((value) => [value, scenarioAt(scenario, defaultAxis, value)]));
    for (const value of values) {
      expect(forward.get(value)).toEqual(reverse.get(value));
      const sample = forward.get(value)!;
      expect(sample.entities.reduce((sum, entity) => sum + entity.supportUnits, sample.residual.supportUnits)).toBe(100_000_000);
      expect(sample.entities.find((entity) => entity.id === 'razem')!.supportUnits).toBe(value);
      expect(sample.entities.find((entity) => entity.id === 'nl')!.supportUnits).toBe(12_910_000 - value);
      expect(sample.lists).toEqual(scenario.lists);
    }
    expect(scenario).toEqual(before);
  });

  it('retains active zero-support entities and rejects impossible sweep ranges', () => {
    const scenario = createDefaultScenario();
    const zero = scenarioAt(scenario, defaultAxis, 0);
    expect(zero.entities.find((entity) => entity.id === 'razem')!.active).toBe(true);
    expect(zero.lists).toEqual(scenario.lists);
    expect(() => sweepValues(scenario, { ...defaultAxis, max: 13_000_000, step: 10_000 })).toThrow(/Zakres/);
  });

  it('reports exact eligibility transitions, districts and actual conserved seat transfers', () => {
    const scenario = createDefaultScenario();
    const beforeScenario = scenarioAt(scenario, defaultAxis, 4_999_999);
    const afterScenario = scenarioAt(scenario, defaultAxis, 5_000_000);
    const before = evaluateScenario(beforeScenario);
    const after = evaluateScenario(afterScenario);
    const beforePoint = summarizePoint(beforeScenario, before, 4_999_999, false, 'L', 'razem');
    const afterPoint = summarizePoint(afterScenario, after, 5_000_000, true, 'L', 'razem');
    const transition = transitionBetween(before, after, beforePoint, afterPoint)!;
    expect(transition.exactThreshold).toBe(true);
    expect(transition.gainedEligibility).toContain('razem');
    expect(transition.districts.length).toBeGreaterThan(0);
    for (const district of transition.districts) expect(Object.values(district.transfers).reduce((sum, seats) => sum + seats, 0)).toBe(0);
    expect(transition.before).toEqual(beforePoint.alliance);
    expect(transition.after).toEqual(afterPoint.alliance);
    expect(transitionBetween(after, after, afterPoint, afterPoint)).toBeNull();
  });
});

describe('two-dimensional experiments', () => {
  it('enforces disjoint funding definitions and default/refinement caps', () => {
    expect(validateHeatAxes(defaultAxis, yAxis).xValues).toHaveLength(21);
    expect(() => validateHeatAxes(defaultAxis, { ...yAxis, donorId: 'nl' })).toThrow(/rozłączne/);
    const refined = { ...defaultAxis, min: 0, max: 100, step: 1 };
    expect(() => validateHeatAxes(refined, yAxis)).toThrow(/41/);
    expect(validateHeatAxes(refined, yAxis, true).xValues).toHaveLength(101);
    expect(() => validateHeatAxes({ ...refined, max: 101 }, yAxis, true)).toThrow(/101/);
  });

  it('preserves disjoint family totals, with no dependence on traversal order', () => {
    const scenario = createDefaultScenario();
    const a = heatCell(scenario, defaultAxis, yAxis, 5_000_000, 6_000_000, 'L');
    const reversed = heatCell(scenario, yAxis, defaultAxis, 6_000_000, 5_000_000, 'L');
    expect(a.bounds).not.toBeNull();
    expect(reversed.bounds).toEqual(a.bounds);
    expect(heatCell(scenario, defaultAxis, yAxis, 5_000_000, 6_000_000, 'L')).toEqual(a);
  });

  it('leaves infeasible cells explicitly blank and never renormalizes', () => {
    const scenario = createDefaultScenario();
    const cell = heatCell(scenario, defaultAxis, yAxis, 13_000_000, 5_000_000, 'L');
    expect(cell.bounds).toBeNull();
    expect(cell.error).toMatch(/pula/);
    expect(cell.x).toBe(13_000_000);
    const overlap = heatCell(scenario, defaultAxis, { ...yAxis, donorId: 'nl' }, 5_000_000, 5_000_000, 'L');
    expect(overlap.bounds).toBeNull();
    expect(overlap.error).toMatch(/rozłączne/);
  });

  it('does not classify an unallocatable model result as a zero-seat cell', () => {
    const scenario = createDefaultScenario();
    const result = evaluateScenario(scenario);
    vi.spyOn(engine, 'evaluateScenario').mockReturnValue({ ...result, status: 'unallocatable' });
    const cell = heatCell(scenario, defaultAxis, yAxis, 5_000_000, 5_000_000, 'L');
    expect(cell.bounds).toBeNull();
    expect(cell.error).toMatch(/Nie można przydzielić/);
  });
});

describe('reproducible scenario state', () => {
  it('JSON and URL preserve all inputs, Unicode, notes, IDs and results', () => {
    const scenario = mergeEntities(createDefaultScenario(), ['nl', 'razem'], 'ordinary');
    scenario.name = 'Zażółć gęślą jaźń · 🗳️';
    scenario.entities[0].label = '„Łódź” <tekst, nie HTML> 🇵🇱';
    scenario.notes = Array.from({ length: 20 }, (_, index) => `Notatka ${index}: łęść \"cytat\" 🗳️`);
    scenario.allianceSelection = ['nl+razem'];
    const json = parseScenario(serializeScenario(scenario));
    const hash = scenarioFromHash(scenarioToHash(scenario));
    expect(json).toEqual(scenario);
    expect(hash).toEqual(scenario);
    expect(scenarioId(json)).toBe(scenarioId(scenario));
    expect(scenarioFingerprint(hash)).toBe(scenarioFingerprint(scenario));
    expect(evaluateScenario(json).nationalListSeats).toEqual(evaluateScenario(scenario).nationalListSeats);
    expect(evaluateScenario(hash).allianceSeats).toEqual(evaluateScenario(scenario).allianceSeats);
    expect(Object.hasOwn(json, 'provenance')).toBe(false);
  });

  it('changes only the hash of a GitHub Pages project URL', () => {
    const url = new URL('https://example.github.io/voting_schemes/?view=lab');
    url.hash = scenarioToHash(createDefaultScenario());
    expect(url.pathname).toBe('/voting_schemes/');
    expect(url.search).toBe('?view=lab');
    expect(scenarioFromHash(url.hash)).toEqual(createDefaultScenario());
  });

  it('rejects incompatible versions, tampered inputs and serialized derived results', () => {
    const scenario = createDefaultScenario();
    expect(() => parseScenario(JSON.stringify({ ...scenario, schemaVersion: 2 }))).toThrow(/wersja/);
    expect(() => parseScenario(JSON.stringify({ ...scenario, dataVersion: 'unavailable' }))).toThrow(/wersja/);
    expect(() => parseScenario(JSON.stringify({ ...scenario, result: { campSeats: { L: 460 } } }))).toThrow(/Nieznane pole/);
    const duplicate = structuredClone(scenario);
    duplicate.lists.push(duplicate.lists[0]);
    expect(() => parseScenario(JSON.stringify(duplicate))).toThrow();
    expect(() => parseScenario('{broken')).toThrow(/JSON/);
    expect(() => scenarioFromHash('#s=💥')).toThrow(/link/);
    expect(() => scenarioFromHash('#s=ww')).toThrow(/odtworzyć/);
    const incompatible = '#s=' + btoa(JSON.stringify({ ...scenario, modelVersion: '2' }).replace(/[^\x00-\x7f]/g, '?'));
    expect(() => scenarioFromHash(incompatible.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'))).toThrow(/wersja/);
  });

  it('enforces size limits in UTF-8 bytes and never emits an unreadable oversized hash', () => {
    const tooLarge = JSON.stringify({ text: 'ę'.repeat(60_000) });
    expect(tooLarge.length).toBeLessThan(100_000);
    expect(() => parseScenario(tooLarge)).toThrow(/100 kB/);
    const scenario = createDefaultScenario();
    scenario.notes = Array.from({ length: 80 }, () => 'a'.repeat(1000));
    expect(() => scenarioToHash(scenario)).toThrow(/zbyt duży/);
  });

  it('exports versioned national/district rows with turnout-scaled votes and unchanged seats', () => {
    const scenario = createDefaultScenario();
    scenario.turnout = baselineTurnout * 0.75;
    const result = evaluateScenario(scenario);
    const csv = exportResultsCsv(scenario, result);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const rows = csv.slice(1).split('\r\n').map((line) => JSON.parse('[' + line + ']') as (string | number)[]);
    const header = rows[0] as string[];
    expect(header).toEqual(['scenario_id', 'model_version', 'data_version', 'geography', 'turnout', 'district_id', 'list_id', 'members', 'committee_type', 'national_support_pct', 'eligible', 'threshold_pct', 'seats_lower', 'seats_upper', 'expected_votes', 'status']);
    expect(rows).toHaveLength(1 + scenario.lists.length * 42);
    expect(rows.every((row) => row.length === header.length)).toBe(true);
    const find = (district: string) => rows.find((row) => row[5] === district && row[6] === 'ko')!;
    const local = find('1');
    expect(Number(local[14])).toBeCloseTo(result.districtAllocations[0].votesByList.ko * 0.75, 8);
    expect(Number(local[12])).toBe(result.districtAllocations[0].seatsByList.ko);
    const national = find('national');
    expect(Number(national[14])).toBeCloseTo(result.districtAllocations.reduce((sum, district) => sum + district.votesByList.ko, 0) * 0.75, 7);
    expect(Number(national[12])).toBe(195);
    expect(national[0]).toBe(scenarioId(scenario));
    expect(national[1]).toBe(scenario.modelVersion);
  });
});

describe('worker response identity', () => {
  it('requires both current request generation and exact scenario fingerprint', () => {
    const response = { requestId: 7, fingerprint: 'scenario-new' };
    expect(isCurrentResponse(response, 7, 'scenario-new')).toBe(true);
    expect(isCurrentResponse(response, 8, 'scenario-new')).toBe(false);
    expect(isCurrentResponse(response, 7, 'scenario-edited')).toBe(false);
    expect(isCurrentResponse({ requestId: 6, fingerprint: 'scenario-old' }, 7, 'scenario-new')).toBe(false);
  });
});
