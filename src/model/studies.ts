import { allianceBounds, allianceIdsForRule } from './alliances';
import { canonicalListId, enumeratePartitions, partitionLists } from './coalitions';
import { IPF_TOLERANCE, REGULARIZATION, SUPPORT_TOTAL } from './constants';
import { historicalData } from './data';
import { allocateDistrict } from './dhondt';
import { determineEligibility } from './eligibility';
import { evaluateScenario } from './engine';
import { calibrate, calibrationFingerprint } from './geography';
import { createDefaultScenario, pollSnapshot } from './presets';
import { validateScenario } from './validation';
import type {
  Calibration,
  CommitteeType,
  DistrictAllocation,
  Result,
  Scenario,
  SeatBounds,
} from './types';
import type {
  CoalitionMatrixStudy,
  ConcentrationStudy,
  MatrixAxisSummary,
  MatrixPartition,
  PairStudy,
  SampleExtrema,
  SampleKind,
  StudyBlock,
  StudyOutcome,
  StudyPoint,
  StudyProgressCallback,
  StudyReport,
  StudySummary,
} from './studies-types';
export type * from './studies-types';

export const ANALYSIS_VERSION = '1.0.0';
const PAIR_STEP = 250_000;
const CONCENTRATION_STEP = 500_000;
const SHORT_LABELS: Record<string, string> = {
  ko: 'KO',
  nl: 'Nowa Lewica',
  razem: 'Razem',
  pps: 'PPS',
  pis: 'PiS',
  konf: 'Konfederacja',
  kkp: 'KKP',
  rozwoj: 'Rozwój Plus',
  psl: 'PSL',
  pl2050: 'Polska 2050',
};

/** Reconstructable analysis baseline: the repository's dated poll, never the editable UI state. */
function prepare(
  scenario: Scenario,
  calibration?: Calibration,
): { scenario: Scenario; fit: Calibration } {
  const valid = validateScenario(scenario);
  const separate = {
    ...valid,
    lists: partitionLists(
      valid.entities.filter((entity) => entity.active).map((entity) => [entity.id]),
      'ordinary',
    ),
    allianceSelection: [],
  };
  const fit = calibration ?? calibrate(separate);
  if (fit.fingerprint !== calibrationFingerprint(separate))
    throw new Error('Analiza wymaga kalibracji bieżącego poparcia i geografii.');
  return { scenario: separate, fit };
}

function blockStatus(
  allocations: DistrictAllocation[],
  lc: SeatBounds,
  r: SeatBounds,
): StudyOutcome['status'] {
  if (allocations.some((district) => district.status === 'unallocatable')) return 'unallocatable';
  return lc.lower === lc.upper && r.lower === r.upper ? 'resolved' : 'ambiguous';
}

function outcomeFromResult(
  scenario: Scenario,
  result: Result,
  pairIds: string[] = [],
): StudyOutcome {
  const lc = allianceBounds(result, allianceIdsForRule(scenario, 'L+C'));
  const r = allianceBounds(result, allianceIdsForRule(scenario, 'R'));
  const pairLists = scenario.lists
    .filter((list) => list.memberEntityIds.some((id) => pairIds.includes(id)))
    .map((list) => list.id);
  return {
    status: blockStatus(result.districtAllocations, lc, r),
    allocationStatus: result.status,
    lc,
    r,
    pair: pairIds.length ? allianceBounds(result, pairLists) : null,
    eligibleIds: Object.keys(result.eligibility)
      .filter((id) => result.eligibility[id].eligible)
      .sort(),
    excludedVoteShare: result.excludedVoteShare,
  };
}

/** Summarize sampled extrema without treating gaps between samples as observed plateaus. */
export function sampledExtrema(bounds: SeatBounds[]): SampleExtrema {
  if (!bounds.length) throw new Error('Brak punktów analizy.');
  const maximum = Math.max(...bounds.map((value) => value.upper));
  const maximumLower = Math.max(...bounds.map((value) => value.lower));
  return {
    minimum: Math.min(...bounds.map((value) => value.lower)),
    maximum,
    maximumLower,
    bestIndices: bounds.flatMap((value, index) => (value.lower === maximum ? [index] : [])),
    possibleBestIndices: bounds.flatMap((value, index) =>
      value.upper >= maximumLower ? [index] : [],
    ),
    resolved: bounds.every((value) => value.lower === value.upper),
  };
}

export function summarizeStudyOutcomes(outcomes: StudyOutcome[]): StudySummary {
  if (!outcomes.length || outcomes.some((outcome) => outcome.status === 'unallocatable'))
    throw new Error('Analiza zawiera brakujący lub nieprzydzielalny wynik.');
  return {
    lc: sampledExtrema(outcomes.map((outcome) => outcome.lc)),
    r: sampledExtrema(outcomes.map((outcome) => outcome.r)),
    pair: outcomes.every((outcome) => outcome.pair !== null)
      ? sampledExtrema(outcomes.map((outcome) => outcome.pair!))
      : null,
    lcMajorities: outcomes.filter((outcome) => outcome.lc.lower >= 231).length,
    rMajorities: outcomes.filter((outcome) => outcome.r.lower >= 231).length,
    noMajority: outcomes.filter((outcome) => outcome.lc.upper < 231 && outcome.r.upper < 231)
      .length,
    unresolved: outcomes.filter((outcome) => outcome.status === 'ambiguous').length,
  };
}

function blockPartitions(scenario: Scenario, block: StudyBlock): MatrixPartition[] {
  const entities = scenario.entities.filter((entity) =>
    block === 'R' ? entity.family === 'R' : entity.family !== 'R',
  );
  return enumeratePartitions(entities)
    .sort((a, b) => b.length - a.length || JSON.stringify(a).localeCompare(JSON.stringify(b)))
    .map((groups, index) => ({
      id: `${block}${String(index + 1).padStart(2, '0')}`,
      groups,
      label: groups
        .map((members) => members.map((id) => SHORT_LABELS[id] ?? id).join(' + '))
        .join(' | '),
    }));
}

/** Complete Cartesian product of within-R and within-L+C partitions; national support is frozen. */
export function buildCoalitionMatrix(
  input: Scenario,
  policy: CommitteeType,
  calibration?: Calibration,
  onProgress?: StudyProgressCallback,
): CoalitionMatrixStudy {
  const { scenario, fit } = prepare(input, calibration);
  const rows = blockPartitions(scenario, 'R');
  const columns = blockPartitions(scenario, 'LC');
  const cells: CoalitionMatrixStudy['cells'] = [];
  for (const [row, right] of rows.entries()) {
    for (const [column, leftCentre] of columns.entries()) {
      const sample = {
        ...scenario,
        lists: partitionLists([...right.groups, ...leftCentre.groups], policy),
      };
      cells.push({
        row,
        column,
        outcome: outcomeFromResult(sample, evaluateScenario(sample, fit)),
      });
    }
    onProgress?.({
      completed: cells.length,
      total: rows.length * columns.length,
      stage: `matrix-${policy}`,
    });
  }
  const axisSummary = (index: number, outcomes: SeatBounds[]): MatrixAxisSummary => ({
    index,
    minimum: Math.min(...outcomes.map((outcome) => outcome.lower)),
    maximum: Math.max(...outcomes.map((outcome) => outcome.upper)),
    guaranteedMajority: outcomes.every((outcome) => outcome.lower >= 231),
  });
  const columnSummaries = columns.map((_, index) =>
    axisSummary(
      index,
      cells.filter((cell) => cell.column === index).map((cell) => cell.outcome.lc),
    ),
  );
  const rowSummaries = rows.map((_, index) =>
    axisSummary(
      index,
      cells.filter((cell) => cell.row === index).map((cell) => cell.outcome.r),
    ),
  );
  const maximinLc = Math.max(...columnSummaries.map((column) => column.minimum));
  const maximinR = Math.max(...rowSummaries.map((row) => row.minimum));
  return {
    policy,
    rows,
    columns,
    cells,
    summary: summarizeStudyOutcomes(cells.map((cell) => cell.outcome)),
    columnSummaries,
    rowSummaries,
    maximinLcColumnIndices: columnSummaries
      .filter((column) => column.minimum === maximinLc)
      .map((column) => column.index),
    maximinRRowIndices: rowSummaries
      .filter((row) => row.minimum === maximinR)
      .map((row) => row.index),
  };
}

/** Mirrored integer grid plus endpoints, current point, and exact 5% threshold neighbourhoods. */
export function studySampleValues(
  totalUnits: number,
  stepUnits: number,
  currentUnits: number,
  balanced = false,
): { xUnits: number; kinds: SampleKind[] }[] {
  if (
    ![totalUnits, stepUnits, currentUnits].every(Number.isSafeInteger) ||
    totalUnits <= 0 ||
    totalUnits > SUPPORT_TOTAL ||
    stepUnits <= 0 ||
    currentUnits < 0 ||
    currentUnits > totalUnits ||
    Math.ceil(totalUnits / stepUnits) > 1000
  )
    throw new Error('Nieprawidłowa siatka badania.');
  const values = new Map<number, Set<SampleKind>>();
  const add = (x: number, kind: SampleKind) => {
    if (!Number.isSafeInteger(x) || x < 0 || x > totalUnits) return;
    const kinds = values.get(x) ?? new Set<SampleKind>();
    kinds.add(kind);
    values.set(x, kinds);
  };
  for (let x = 0; x <= totalUnits; x += stepUnits) {
    add(x, 'grid');
    add(totalUnits - x, 'mirrored-grid');
  }
  add(0, 'endpoint');
  add(totalUnits, 'endpoint');
  add(currentUnits, 'current');
  add(totalUnits - currentUnits, 'mirrored-grid');
  if (balanced) {
    add(Math.floor(totalUnits / 2), 'balanced');
    add(Math.ceil(totalUnits / 2), 'balanced');
  }
  for (const threshold of [5_000_000, totalUnits - 5_000_000]) {
    add(threshold, 'threshold');
    add(threshold - 1, 'threshold-neighbour');
    add(threshold + 1, 'threshold-neighbour');
  }
  return [...values]
    .sort(([a], [b]) => a - b)
    .map(([xUnits, kinds]) => ({ xUnits, kinds: [...kinds].sort() }));
}

interface StudyList {
  id: string;
  block: StudyBlock;
  supportUnits: number;
  committeeType: CommitteeType;
  districtVotes: number[];
}

function atomicStudyLists(scenario: Scenario, fit: Calibration): StudyList[] {
  const columns = new Map(fit.entityIds.map((id, index) => [id, index]));
  return scenario.entities
    .filter((entity) => entity.active)
    .map((entity) => ({
      id: entity.id,
      block: entity.family === 'R' ? 'R' : 'LC',
      supportUnits: entity.supportUnits,
      committeeType: 'ordinary',
      districtVotes: fit.matrix.map((row) => row[columns.get(entity.id)!]),
    }));
}

/** Allocate genuine or hypothetical lists with the existing threshold/quotient engine, without forging scenario entities. */
function evaluateStudyLists(
  lists: StudyList[],
  residualUnits: number,
  pairIds: string[] = [],
): StudyOutcome {
  if (
    lists.reduce((sum, list) => sum + list.supportUnits, residualUnits) !== SUPPORT_TOTAL ||
    new Set(lists.map((list) => list.id)).size !== lists.length ||
    lists.some(
      (list) =>
        list.districtVotes.length !== historicalData.districts.length ||
        list.districtVotes.some((votes) => !Number.isFinite(votes) || votes < 0),
    )
  )
    throw new Error('Nieprawidłowa macierz głosów analizy.');
  const { eligibility } = determineEligibility(
    lists.map((list) => ({
      id: list.id,
      votes: list.supportUnits,
      committeeType: list.committeeType,
      minorityExempt: false,
    })),
  );
  const eligibleIds = lists
    .filter((list) => eligibility[list.id].eligible)
    .map((list) => list.id)
    .sort();
  const allocations = historicalData.districts.map((district, row) =>
    allocateDistrict(
      Object.fromEntries(
        lists
          .filter((list) => eligibility[list.id].eligible)
          .map((list) => [list.id, list.districtVotes[row]]),
      ),
      district.seats,
      district.id,
    ),
  );
  const result = { districtAllocations: allocations };
  const lc = allianceBounds(
    result,
    lists.filter((list) => list.block === 'LC').map((list) => list.id),
  );
  const r = allianceBounds(
    result,
    lists.filter((list) => list.block === 'R').map((list) => list.id),
  );
  const allocationStatus = allocations.some((district) => district.status === 'unallocatable')
    ? 'unallocatable'
    : allocations.some((district) => district.status === 'ambiguous')
      ? 'ambiguous'
      : 'resolved';
  return {
    status: blockStatus(allocations, lc, r),
    allocationStatus,
    lc,
    r,
    pair: pairIds.length ? allianceBounds(result, pairIds) : null,
    eligibleIds,
    excludedVoteShare:
      (lists
        .filter((list) => !eligibility[list.id].eligible)
        .reduce((sum, list) => sum + list.supportUnits, residualUnits) /
        SUPPORT_TOTAL) *
      100,
  };
}

/** Hold every other atomic regional vote fixed; all specified pairs share one historical proxy. */
export function buildPairStudy(
  input: Scenario,
  targetId: string,
  donorId: string,
  calibration?: Calibration,
): PairStudy {
  const { scenario, fit } = prepare(input, calibration);
  const target = scenario.entities.find((entity) => entity.id === targetId);
  const donor = scenario.entities.find((entity) => entity.id === donorId);
  if (
    !target?.active ||
    !donor?.active ||
    targetId === donorId ||
    target.family !== donor.family ||
    target.proxyId !== donor.proxyId
  )
    throw new Error('Badanie pary wymaga dwóch aktywnych podmiotów o wspólnym profilu i grupie.');
  const lists = atomicStudyLists(scenario, fit);
  const a = lists.find((list) => list.id === targetId)!;
  const b = lists.find((list) => list.id === donorId)!;
  const others = lists.filter((list) => ![targetId, donorId].includes(list.id));
  const totalUnits = a.supportUnits + b.supportUnits;
  const combinedVotes = a.districtVotes.map((votes, row) => votes + b.districtVotes[row]);
  const currentFraction = a.supportUnits / totalUnits;
  if (
    combinedVotes.some(
      (votes, row) =>
        Math.abs(a.districtVotes[row] - votes * currentFraction) /
          historicalData.totals.validVotes2023 >
        IPF_TOLERANCE * 4,
    )
  )
    throw new Error('Profile pary nie są proporcjonalne; nie można zamrozić pozostałych wyborców.');
  const points: StudyPoint[] = studySampleValues(totalUnits, PAIR_STEP, target.supportUnits).map(
    ({ xUnits, kinds }) => {
      const firstVotes = combinedVotes.map((votes) => votes * (xUnits / totalUnits));
      const secondVotes = combinedVotes.map((votes, row) => votes - firstVotes[row]);
      return {
        xUnits,
        otherUnits: totalUnits - xUnits,
        kinds,
        outcome: evaluateStudyLists(
          [
            ...others,
            { ...a, supportUnits: xUnits, districtVotes: firstVotes },
            { ...b, supportUnits: totalUnits - xUnits, districtVotes: secondVotes },
          ],
          scenario.residual.supportUnits,
          [targetId, donorId],
        ),
      };
    },
  );
  const pooledId = canonicalListId([targetId, donorId]);
  const pooled = evaluateStudyLists(
    [
      ...others,
      {
        id: pooledId,
        block: a.block,
        supportUnits: totalUnits,
        committeeType: 'coalition',
        districtVotes: combinedVotes,
      },
    ],
    scenario.residual.supportUnits,
    [pooledId],
  );
  return {
    id: `${targetId}-${donorId}`,
    targetId,
    donorId,
    targetLabel: target.label,
    donorLabel: donor.label,
    block: a.block,
    totalUnits,
    baselineUnits: target.supportUnits,
    stepUnits: PAIR_STEP,
    points,
    pooled,
    summary: summarizeStudyOutcomes(points.map((point) => point.outcome)),
  };
}

/** Split the pooled L+C regional electorate between two hypothetical ordinary committees with identical geography. */
export function buildConcentrationStudy(
  input: Scenario,
  calibration?: Calibration,
): ConcentrationStudy {
  const { scenario, fit } = prepare(input, calibration);
  const lists = atomicStudyLists(scenario, fit);
  const left = lists.filter((list) => list.block === 'LC');
  const right = lists.filter((list) => list.block === 'R');
  const totalUnits = left.reduce((sum, list) => sum + list.supportUnits, 0);
  const combinedVotes = historicalData.districts.map((_, row) =>
    left.reduce((sum, list) => sum + list.districtVotes[row], 0),
  );
  // Hypothetical A/B have no observed poll split; the midpoint is only a reference sample.
  const baselineUnits = Math.floor(totalUnits / 2);
  const oneParty = evaluateStudyLists(
    [
      ...right,
      {
        id: 'hypothetical-lc',
        block: 'LC',
        supportUnits: totalUnits,
        committeeType: 'ordinary',
        districtVotes: combinedVotes,
      },
    ],
    scenario.residual.supportUnits,
  );
  const points: StudyPoint[] = studySampleValues(
    totalUnits,
    CONCENTRATION_STEP,
    baselineUnits,
    true,
  ).map(({ xUnits, kinds }) => {
    const firstVotes = combinedVotes.map((votes) => votes * (xUnits / totalUnits));
    return {
      xUnits,
      otherUnits: totalUnits - xUnits,
      kinds: kinds.filter((kind) => kind !== 'current'),
      outcome: evaluateStudyLists(
        [
          ...right,
          {
            id: 'hypothetical-a',
            block: 'LC',
            supportUnits: xUnits,
            committeeType: 'ordinary',
            districtVotes: firstVotes,
          },
          {
            id: 'hypothetical-b',
            block: 'LC',
            supportUnits: totalUnits - xUnits,
            committeeType: 'ordinary',
            districtVotes: combinedVotes.map((votes, row) => votes - firstVotes[row]),
          },
        ],
        scenario.residual.supportUnits,
      ),
    };
  });
  return {
    id: 'lc-concentration',
    interpretation: 'shared-profile',
    totalUnits,
    baselineUnits,
    stepUnits: CONCENTRATION_STEP,
    defaultOutcome: outcomeFromResult(scenario, evaluateScenario(scenario, fit)),
    oneParty,
    points,
    summary: summarizeStudyOutcomes(points.map((point) => point.outcome)),
  };
}

/** Deterministic report for all five requested analyses; IO adds timestamps/git provenance separately. */
export function buildStudyReport(onProgress?: StudyProgressCallback): StudyReport {
  const scenario = createDefaultScenario();
  const fit = calibrate(scenario);
  const matrix = (policy: CommitteeType) => buildCoalitionMatrix(scenario, policy, fit, onProgress);
  const matrices = { coalition: matrix('coalition'), ordinary: matrix('ordinary') };
  const pairs = [
    ['razem', 'nl'],
    ['konf', 'kkp'],
    ['pis', 'rozwoj'],
  ].map(([target, donor], index) => {
    const study = buildPairStudy(scenario, target, donor, fit);
    onProgress?.({ completed: index + 1, total: 3, stage: 'pairs' });
    return study;
  });
  const concentration = buildConcentrationStudy(scenario, fit);
  onProgress?.({ completed: 1, total: 1, stage: 'concentration' });
  return {
    metadata: {
      analysisVersion: ANALYSIS_VERSION,
      modelVersion: scenario.modelVersion,
      dataVersion: scenario.dataVersion,
      pollId: scenario.pollId,
      pollster: pollSnapshot.pollster,
      fieldworkStart: pollSnapshot.fieldworkStart,
      fieldworkEnd: pollSnapshot.fieldworkEnd,
      publicationDate: pollSnapshot.publicationDate,
      sampleSize: pollSnapshot.sampleSize,
      geographyMode: scenario.geographyMode,
      regularizer: REGULARIZATION,
      scenario,
      sourceUrls: [...pollSnapshot.sourceUrls],
      assumptions: [
        'Dwa bloki parlamentarne: L+C i R. Centrum zawsze należy do L+C, także gdy startuje osobno.',
        'Zamrożony sondaż Pollster 19–21 października 2026; PPS pozostaje nieaktywny, a reszta 0,51% nie otrzymuje mandatów.',
        'Geografia grup z 2023 r.; krajowe udziały każdego podmiotu są dokładnymi marginesami modelu.',
        'Macierz obejmuje wszystkie 52 podziały L+C i 15 podziałów R, osobno dla wspólnych list 8% i 5%; pojedyncze podmioty mają próg 5%.',
        'Badania par zmieniają tylko podział wspólnego regionalnego elektoratu danej pary. Pozostałe podmioty startują osobno i zachowują głosy.',
        'Nominalny krok par: 0,25 p.p.; dwóch list L+C: 0,5 p.p. Dodano lustrzane punkty siatki, bieżące udziały, końce oraz dokładne progi 5% i sąsiadów oddalonych o 0,000001 p.p.',
        'Dwie hipotetyczne partie L+C dzielą identyczny łączny profil regionalny; analizujemy rozdrobnienie głosów, nie odrębne elektoraty ideologiczne.',
        'Maksima przebiegów dotyczą zbadanych punktów, nie stanowią dowodu optimum w całym ciągłym zakresie.',
        'Mandaty wspólnej listy należą do listy; nie wyznaczamy wewnętrznego podziału między partie.',
        'Nie zakładamy utraty głosów po łączeniu, zmian mobilizacji ani efektów kandydatów; wyniki nie są prognozą ani prawdopodobieństwem.',
      ],
    },
    baseline: outcomeFromResult(scenario, evaluateScenario(scenario, fit)),
    matrices,
    pairs,
    concentration,
  };
}
