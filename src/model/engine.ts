import { allianceBounds } from './alliances';
import { listFamily } from './coalitions';
import { SUPPORT_TOTAL } from './constants';
import { historicalData } from './data';
import { allocateDistrict } from './dhondt';
import { determineEligibility } from './eligibility';
import { calibrate, calibrationFingerprint, poolVotes } from './geography';
import type {
  Calibration,
  DistrictAllocation,
  Eligibility,
  Family,
  Result,
  Scenario,
} from './types';
import { validateScenario } from './validation';

const calibrationCache = new Map<string, Calibration>();

/** Bounded memoization ensures grouping or turnout edits never rerun atomic calibration. */
export function calibratedVotes(scenario: Scenario): Calibration {
  const key = calibrationFingerprint(scenario);
  const cached = calibrationCache.get(key);
  if (cached) return cached;
  const computed = calibrate(scenario);
  if (calibrationCache.size >= 8) calibrationCache.delete(calibrationCache.keys().next().value!);
  calibrationCache.set(key, computed);
  return computed;
}

function summarize(
  ids: string[],
  allocations: DistrictAllocation[],
  eligibility: Record<string, Eligibility>,
  regime: 'normal' | 'fallback',
  alignments: Record<string, Family>,
  selectedIds: string[],
  excludedVoteShare: number,
  calibration: { iterations: number; maxError: number },
): Result {
  const nationalListSeatBounds = Object.fromEntries(
    ids.map((id) => [id, allianceBounds({ districtAllocations: allocations }, [id])]),
  );
  const nationalListSeats = Object.fromEntries(
    ids.map((id) => [id, nationalListSeatBounds[id].lower]),
  );
  const campBounds = Object.fromEntries(
    (['L', 'R', 'C'] as const).map((family) => [
      family,
      allianceBounds(
        { districtAllocations: allocations },
        ids.filter((id) => alignments[id] === family),
      ),
    ]),
  ) as Result['campBounds'];
  const campSeats = { L: campBounds.L.lower, R: campBounds.R.lower, C: campBounds.C.lower };
  const status = allocations.some((district) => district.status === 'unallocatable')
    ? 'unallocatable'
    : allocations.some((district) => district.status === 'ambiguous')
      ? 'ambiguous'
      : 'resolved';
  const warnings: string[] = [];
  if (regime === 'fallback')
    warnings.push('Zastosowano art. 198: próg 3% dla komitetów zwykłych i 5% dla koalicyjnych.');
  if (status === 'unallocatable')
    warnings.push(
      'Co najmniej jeden okręg nie ma dodatnich głosów na uprawnioną listę. Nie można przydzielić wszystkich mandatów.',
    );
  if (allocations.some((district) => district.unresolved?.reason === 'numerical'))
    warnings.push(
      'Ilorazy przy granicy mandatu są numerycznie nierozróżnialne (tolerancja względna 1e-12). Pokazano konserwatywne przedziały, a nie rozstrzygnięcie remisu prawnego.',
    );
  if (allocations.some((district) => district.unresolved?.reason === 'precinct-tie'))
    warnings.push(
      'Dokładny remis wymaga danych obwodowych. Brak rozstrzygnięcia; pokazano przedziały mandatów.',
    );
  return {
    status,
    eligibility,
    thresholdRegime: regime,
    districtAllocations: allocations,
    nationalListSeats,
    nationalListSeatBounds,
    campSeats,
    campBounds,
    allianceSeats: allianceBounds({ districtAllocations: allocations }, selectedIds),
    excludedVoteShare,
    runningListCount: ids.length,
    eligibleListCount: ids.filter((id) => eligibility[id].eligible).length,
    winningListCount: ids.filter((id) => nationalListSeatBounds[id].upper > 0).length,
    warnings,
    calibration,
  };
}

/** Full scenario evaluation. Pass an existing fit to isolate changes in grouping exactly. */
export function evaluateScenario(scenario: Scenario, calibration?: Calibration): Result {
  validateScenario(scenario);
  const fit = calibration ?? calibratedVotes(scenario);
  const pooled = poolVotes(scenario, fit);
  const inputs = scenario.lists.map((list) => ({
    ...list,
    votes: list.memberEntityIds.reduce(
      (sum, id) => sum + scenario.entities.find((entity) => entity.id === id)!.supportUnits,
      0,
    ),
  }));
  const { eligibility, thresholdRegime } = determineEligibility(inputs);
  const allocations = historicalData.districts.map((district, index) => {
    const eligibleVotes = Object.fromEntries(
      Object.entries(pooled[index]).filter(([id]) => eligibility[id].eligible),
    );
    const allocation = allocateDistrict(eligibleVotes, district.seats, district.id);
    for (const list of scenario.lists) {
      allocation.seatsByList[list.id] ??= 0;
      allocation.seatBounds[list.id] ??= { lower: 0, upper: 0 };
    }
    allocation.votesByList = pooled[index];
    return allocation;
  });
  const excluded = inputs
    .filter((list) => !eligibility[list.id].eligible)
    .reduce((sum, list) => sum + list.votes, scenario.residual.supportUnits);
  return summarize(
    scenario.lists.map((list) => list.id),
    allocations,
    eligibility,
    thresholdRegime,
    Object.fromEntries(
      scenario.lists.map((list) => [list.id, listFamily(list, scenario.entities)]),
    ),
    scenario.allianceSelection,
    (excluded / SUPPORT_TOTAL) * 100,
    { iterations: fit.iterations, maxError: fit.maxError },
  );
}

/** Replay actual 2023 votes with exact integer quotients, legal forms and registration coverage. */
export function replayHistorical(): Result {
  const { districts, committees, totals } = historicalData;
  const inputs = committees.map((committee) => ({
    ...committee,
    votes: districts.reduce((sum, district) => sum + district.votesByCommittee[committee.id], 0),
  }));
  const { eligibility, thresholdRegime } = determineEligibility(inputs, totals.validVotes2023);
  const allocations = districts.map((district) => {
    const votes = Object.fromEntries(
      committees
        .filter(
          (committee) => eligibility[committee.id].eligible && district.onBallot[committee.id],
        )
        .map((committee) => [committee.id, district.votesByCommittee[committee.id]]),
    );
    const allocation = allocateDistrict(votes, district.seats, district.id, true);
    for (const committee of committees) {
      allocation.seatsByList[committee.id] ??= 0;
      allocation.seatBounds[committee.id] ??= { lower: 0, upper: 0 };
    }
    allocation.votesByList = district.votesByCommittee;
    return allocation;
  });
  const alignments = Object.fromEntries(
    committees.map((committee) => [
      committee.id,
      (['ko', 'nl'].includes(committee.id)
        ? 'L'
        : ['pis', 'konf'].includes(committee.id)
          ? 'R'
          : 'C') as Family,
    ]),
  );
  const excluded = inputs
    .filter((list) => !eligibility[list.id].eligible)
    .reduce((sum, list) => sum + list.votes, 0);
  return summarize(
    committees.map((committee) => committee.id),
    allocations,
    eligibility,
    thresholdRegime,
    alignments,
    [],
    (excluded / totals.validVotes2023) * 100,
    { iterations: 0, maxError: 0 },
  );
}
