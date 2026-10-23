import { allianceBounds, allianceIdsForRule, type AllianceRule } from './alliances';
import { evaluateScenario } from './engine';
import { redistributeSupport } from './support';
import type { Result, Scenario, SeatBounds } from './types';

export interface Axis { targetId: string; donorId: string; min: number; max: number; step: number }
export interface SweepPoint {
  x: number; exactThreshold: boolean; eligible: string[]; eligibleCount: number;
  listSeats: Record<string, number>; campSeats: Result['campSeats']; alliance: SeatBounds;
  selectedAlliance: SeatBounds; selectedList: SeatBounds; status: Result['status'];
}
export interface Transition {
  from: number; to: number; exactThreshold: boolean; gainedEligibility: string[]; lostEligibility: string[];
  districts: { id: number; transfers: Record<string, number> }[];
  before: SeatBounds; after: SeatBounds;
}
export interface SweepOutput { points: SweepPoint[]; transitions: Transition[]; axis: Axis }
export interface HeatCell { x: number; y: number; bounds: SeatBounds | null; error?: string }
export interface HeatOutput { cells: HeatCell[]; xValues: number[]; yValues: number[]; xAxis: Axis; yAxis: Axis }

/** Integer grid construction never accumulates floating point steps. Units are 1e-6 percentage point. */
export function axisValues(axis: Axis, cap = 2001): number[] {
  if (![axis.min, axis.max, axis.step].every(Number.isSafeInteger) || axis.min < 0 || axis.max > 100_000_000 || axis.max < axis.min || axis.step < 1) throw new Error('Nieprawidłowy zakres lub rozdzielczość badania.');
  if (axis.targetId === axis.donorId) throw new Error('Cel i dawca muszą być różni.');
  const count = Math.floor((axis.max - axis.min) / axis.step) + 1;
  if (count > cap) throw new Error(`Limit badania: ${cap} punktów na osi.`);
  const values = Array.from({ length: count }, (_, index) => axis.min + index * axis.step);
  if (values.at(-1) !== axis.max) values.push(axis.max);
  if (values.length > cap) throw new Error(`Limit badania: ${cap} punktów na osi.`);
  return values;
}

/** Include exact legal threshold crossings and immediately adjacent representable shares. */
export function sweepValues(scenario: Scenario, axis: Axis): { values: number[]; thresholds: Set<number> } {
  const values = new Set(axisValues(axis));
  const target = scenario.entities.find((entity) => entity.id === axis.targetId);
  const donor = scenario.entities.find((entity) => entity.id === axis.donorId);
  if (!target?.active || !donor?.active || target.locked || donor.locked) throw new Error('Wybierz aktywny, odblokowany cel i dawcę.');
  const thresholds = new Set<number>();
  for (const list of scenario.lists) {
    const direction = Number(list.memberEntityIds.includes(target.id)) - Number(list.memberEntityIds.includes(donor.id));
    if (!direction) continue;
    const support = list.memberEntityIds.reduce((sum, id) => sum + scenario.entities.find((entity) => entity.id === id)!.supportUnits, 0);
    for (const threshold of list.committeeType === 'ordinary' ? [3_000_000, 5_000_000] : [5_000_000, 8_000_000]) {
      const crossing = target.supportUnits + (threshold - support) / direction;
      if (crossing < axis.min || crossing > axis.max) continue;
      thresholds.add(crossing);
      for (const value of [crossing - 1, crossing, crossing + 1]) if (value >= axis.min && value <= axis.max) values.add(value);
    }
  }
  if (values.size > 2001) throw new Error('Limit 2001 próbek obejmuje także dokładne progi i ich sąsiadów. Zmniejsz zakres.');
  return { values: [...values].sort((a, b) => a - b), thresholds };
}

export function scenarioAt(scenario: Scenario, axis: Axis, value: number): Scenario {
  return redistributeSupport(scenario, axis.targetId, value, [axis.donorId]);
}

export function summarizePoint(scenario: Scenario, result: Result, x: number, exactThreshold: boolean, rule: AllianceRule, targetId: string): SweepPoint {
  const targetList = scenario.lists.find((list) => list.memberEntityIds.includes(targetId))!;
  return { x, exactThreshold, eligible: Object.keys(result.eligibility).filter((id) => result.eligibility[id].eligible), eligibleCount: result.eligibleListCount, listSeats: result.nationalListSeats, campSeats: result.campSeats, alliance: allianceBounds(result, allianceIdsForRule(scenario, rule)), selectedAlliance: result.allianceSeats, selectedList: result.nationalListSeatBounds[targetList.id], status: result.status };
}

export function transitionBetween(previous: Result, next: Result, from: SweepPoint, to: SweepPoint): Transition | null {
  const gainedEligibility = to.eligible.filter((id) => !from.eligible.includes(id));
  const lostEligibility = from.eligible.filter((id) => !to.eligible.includes(id));
  const districts = next.districtAllocations.flatMap((district, index) => {
    const old = previous.districtAllocations[index];
    const transfers = Object.fromEntries(Object.keys(district.seatsByList).map((id) => [id, district.seatsByList[id] - (old.seatsByList[id] ?? 0)]).filter(([, delta]) => delta !== 0));
    return Object.keys(transfers).length || JSON.stringify(district.unresolved) !== JSON.stringify(old.unresolved) ? [{ id: district.districtId, transfers }] : [];
  });
  if (!gainedEligibility.length && !lostEligibility.length && !districts.length) return null;
  return { from: from.x, to: to.x, exactThreshold: (from.exactThreshold || to.exactThreshold) && to.x - from.x === 1 && (gainedEligibility.length + lostEligibility.length > 0), gainedEligibility, lostEligibility, districts, before: from.alliance, after: to.alliance };
}

export function validateHeatAxes(x: Axis, y: Axis, refinement = false): { xValues: number[]; yValues: number[] } {
  if (new Set([x.targetId, x.donorId, y.targetId, y.donorId]).size !== 4) throw new Error('Osie muszą mieć rozłączne cele i pule dawców.');
  const limit = refinement ? 101 : 41;
  return { xValues: axisValues(x, limit), yValues: axisValues(y, limit) };
}

/** Each cell is reconstructed from the frozen scenario; impossible support stays explicitly invalid. */
export function heatCell(scenario: Scenario, xAxis: Axis, yAxis: Axis, x: number, y: number, rule: AllianceRule): HeatCell {
  try {
    const sample = scenarioAt(scenarioAt(scenario, xAxis, x), yAxis, y);
    const result = evaluateScenario(sample);
    return { x, y, bounds: allianceBounds(result, allianceIdsForRule(sample, rule)) };
  } catch (error) { return { x, y, bounds: null, error: error instanceof Error ? error.message : 'Nieprawidłowe poparcie' }; }
}
