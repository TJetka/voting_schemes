import { districtAllianceBounds } from './dhondt';
import { listFamily } from './coalitions';
import type { Result, Scenario, SeatBounds } from './types';

export type AllianceRule = 'L' | 'R' | 'L+C' | 'R+C';

export function allianceBounds(
  result: Pick<Result, 'districtAllocations'>,
  ids: readonly string[],
): SeatBounds {
  return result.districtAllocations.reduce(
    (sum, district) => {
      const bounds = districtAllianceBounds(district, ids);
      return { lower: sum.lower + bounds.lower, upper: sum.upper + bounds.upper };
    },
    { lower: 0, upper: 0 },
  );
}

export function allianceIdsForRule(scenario: Scenario, rule: AllianceRule): string[] {
  const family = rule.startsWith('L') ? 'L' : 'R';
  return scenario.lists
    .filter((list) => {
      const alignment = listFamily(list, scenario.entities);
      return alignment === family || (rule.endsWith('+C') && alignment === 'C');
    })
    .map((list) => list.id);
}

export function majorityLabel(bounds: SeatBounds): string {
  if (bounds.lower >= 231) return 'Większość mandatów w każdym rozstrzygnięciu';
  if (bounds.upper >= 231) return 'Większość zależy od nierozstrzygniętej granicy';
  return 'Poniżej większości 231 mandatów';
}

export function majorityCategory(bounds: SeatBounds): 'majority' | 'uncertain' | 'minority' {
  return bounds.lower >= 231 ? 'majority' : bounds.upper >= 231 ? 'uncertain' : 'minority';
}
