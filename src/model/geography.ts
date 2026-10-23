import { IPF_TOLERANCE, REGULARIZATION, SUPPORT_TOTAL } from './constants';
import { historicalData } from './data';
import type { Calibration, Family, Scenario } from './types';

/** Analytical 2023 electorates; these are assumptions, not candidate-level voter identities. */
export const HISTORICAL_FAMILY_PROXIES: Record<Family, readonly string[]> = {
  L: ['ko', 'nl'],
  R: ['pis', 'konf'],
  C: ['td'],
};
const FAMILIES = ['L', 'R', 'C'] as const;
const totalVotes = historicalData.totals.validVotes2023;
const weights = historicalData.districts.map((district) => district.validVotes2023 / totalVotes);
const nationalVotes = Object.fromEntries(
  historicalData.committees.map((committee) => [
    committee.id,
    historicalData.districts.reduce(
      (sum, district) => sum + district.votesByCommittee[committee.id],
      0,
    ),
  ]),
);

/** Only atomic support and geography affect calibration; list partition and turnout are excluded. */
export function calibrationFingerprint(scenario: Scenario): string {
  return JSON.stringify([
    scenario.dataVersion,
    scenario.modelVersion,
    scenario.geographyMode,
    scenario.residual.supportUnits,
    [...scenario.entities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entity) => [entity.id, entity.family, entity.supportUnits, entity.proxyId]),
  ]);
}

interface MarginFit {
  matrix: number[][];
  iterations: number;
  maxError: number;
}

function marginError(matrix: number[][], rows: number[], columns: number[]): number {
  let error = 0;
  for (let column = 0; column < columns.length; column++) {
    let sum = 0;
    for (let row = 0; row < matrix.length; row++) sum += matrix[row][column];
    error = Math.max(error, Math.abs(sum - columns[column]));
  }
  for (let row = 0; row < matrix.length; row++)
    error = Math.max(
      error,
      Math.abs(matrix[row].reduce((sum, value) => sum + value, 0) - rows[row]),
    );
  return error;
}

/** Column-then-row IPF, in fractions of national valid votes; zero targets remain exact zero. */
function fitMargins(
  matrix: number[][],
  rows: number[],
  columns: number[],
  maxIterations: number,
  tolerance = IPF_TOLERANCE,
): MarginFit {
  const activeColumns = columns.flatMap((target, column) => (target > 0 ? [column] : []));
  let maxError = Infinity;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    for (const column of activeColumns) {
      let sum = 0;
      for (let row = 0; row < matrix.length; row++) sum += matrix[row][column];
      const scale = columns[column] / sum;
      for (let row = 0; row < matrix.length; row++) matrix[row][column] *= scale;
    }
    for (let row = 0; row < matrix.length; row++) {
      const scale = rows[row] / matrix[row].reduce((sum, value) => sum + value, 0);
      for (const column of activeColumns) matrix[row][column] *= scale;
    }
    maxError = marginError(matrix, rows, columns);
    if (maxError <= tolerance) return { matrix, iterations: iteration, maxError };
  }
  throw new Error(
    `Kalibracja IPF nie osiągnęła tolerancji ${tolerance} po ${maxIterations} iteracjach (błąd ${maxError}).`,
  );
}

/** Fit camp geography first, then the conditional 2023 party geography inside each camp. */
function fitFamilies(
  entities: Scenario['entities'],
  targets: number[],
  maxIterations: number,
): MarginFit {
  // Integer sums avoid changes in family margins caused by floating-point summation of parties.
  const campTargets = FAMILIES.map(
    (family) =>
      entities
        .filter((entity) => entity.family === family)
        .reduce((sum, entity) => sum + entity.supportUnits, 0) / SUPPORT_TOTAL,
  );
  const campHistorical = historicalData.districts.map((district) =>
    FAMILIES.map((family) =>
      HISTORICAL_FAMILY_PROXIES[family].reduce((sum, id) => sum + district.votesByCommittee[id], 0),
    ),
  );
  const campNational = FAMILIES.map((_, column) =>
    campHistorical.reduce((sum, row) => sum + row[column], 0),
  );
  const campColumns = [...campTargets, targets[targets.length - 1]];
  const campSeed = historicalData.districts.map((district, row) =>
    campColumns.map((target, column) => {
      const relative =
        column === FAMILIES.length
          ? 1
          : campHistorical[row][column] /
            district.validVotes2023 /
            (campNational[column] / totalVotes);
      return weights[row] * target * ((1 - REGULARIZATION) * relative + REGULARIZATION);
    }),
  );
  // Leave numerical headroom for the second fit and the final combined margin check.
  const campFit = fitMargins(campSeed, weights, campColumns, maxIterations, IPF_TOLERANCE / 16);
  const matrix = weights.map(() => targets.map(() => 0));
  let iterations = campFit.iterations;
  let maxError = campFit.maxError;
  FAMILIES.forEach((family, campColumn) => {
    if (campTargets[campColumn] === 0) return;
    const columns = entities.flatMap((entity, column) =>
      entity.family === family ? [column] : [],
    );
    const rows = campFit.matrix.map((row) => row[campColumn]);
    const seed = historicalData.districts.map((district, row) =>
      columns.map((column) => {
        if (targets[column] === 0) return 0;
        const proxy = entities[column].proxyId;
        // Conditional profile: the historical proxy's share WITHIN the historical camp.
        const relative =
          district.votesByCommittee[proxy] /
          campHistorical[row][campColumn] /
          (nationalVotes[proxy] / campNational[campColumn]);
        return (
          rows[row] *
          (targets[column] / campTargets[campColumn]) *
          ((1 - REGULARIZATION) * relative + REGULARIZATION)
        );
      }),
    );
    const fit = fitMargins(
      seed,
      rows,
      columns.map((column) => targets[column]),
      maxIterations,
      IPF_TOLERANCE / 8,
    );
    iterations += fit.iterations;
    maxError = Math.max(maxError, fit.maxError);
    for (let row = 0; row < matrix.length; row++)
      columns.forEach((column, index) => {
        matrix[row][column] = fit.matrix[row][index];
      });
  });
  for (let row = 0; row < matrix.length; row++)
    matrix[row][targets.length - 1] = campFit.matrix[row][FAMILIES.length];
  maxError = Math.max(maxError, marginError(matrix, weights, targets));
  if (!Number.isFinite(maxError) || maxError > IPF_TOLERANCE)
    throw new Error('Kalibracja IPF grup nie zachowała sum okręgowych i krajowych.');
  return { matrix, iterations, maxError };
}

/** Preserve district vote totals and every national target; family mode also fixes camp margins. */
export function calibrate(scenario: Scenario, maxIterations = 10000): Calibration {
  const districts = historicalData.districts;
  const entities = [...scenario.entities].sort((a, b) => a.id.localeCompare(b.id));
  const entityIds = [...entities.map((entity) => entity.id), '__residual'];
  const targets = [
    ...entities.map((entity) => entity.supportUnits / SUPPORT_TOTAL),
    scenario.residual.supportUnits / SUPPORT_TOTAL,
  ];
  if (
    targets.some((value) => !Number.isFinite(value) || value < 0) ||
    Math.abs(targets.reduce((sum, value) => sum + value, 0) - 1) > 1e-14
  )
    throw new Error('IPF: udziały muszą sumować się do 100%.');
  if (entities.some((entity) => !nationalVotes[entity.proxyId]))
    throw new Error('Nieznany lub pusty profil geograficzny.');
  let fit: MarginFit;
  if (scenario.geographyMode === 'family') {
    fit = fitFamilies(entities, targets, maxIterations);
  } else {
    // Preserve version 1.0's flat fit for saved scenarios and an explicit comparison mode.
    const matrix = districts.map((district, row) =>
      targets.map((target, column) => {
        if (target === 0) return 0;
        const proxyId = entities[column]?.proxyId;
        const relative =
          scenario.geographyMode === 'uniform' || !proxyId
            ? 1
            : district.votesByCommittee[proxyId] /
              district.validVotes2023 /
              (nationalVotes[proxyId] / totalVotes);
        return weights[row] * target * ((1 - REGULARIZATION) * relative + REGULARIZATION);
      }),
    );
    fit = fitMargins(matrix, weights, targets, maxIterations);
  }
  return {
    ...fit,
    matrix: fit.matrix.map((values) => values.map((value) => value * totalVotes)),
    entityIds,
    fingerprint: calibrationFingerprint(scenario),
  };
}

/** Pool already calibrated atomic columns, without rerunning IPF or scaling turnout. */
export function poolVotes(scenario: Scenario, calibration: Calibration): Record<string, number>[] {
  if (calibration.fingerprint !== calibrationFingerprint(scenario))
    throw new Error('Kalibracja pochodzi z innego scenariusza poparcia lub geografii.');
  const columns = new Map(calibration.entityIds.map((id, index) => [id, index]));
  return calibration.matrix.map((row) =>
    Object.fromEntries(
      scenario.lists.map((list) => [
        list.id,
        list.memberEntityIds.reduce((sum, id) => sum + row[columns.get(id)!], 0),
      ]),
    ),
  );
}
