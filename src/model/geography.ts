import { IPF_TOLERANCE, REGULARIZATION, SUPPORT_TOTAL } from './constants';
import { historicalData } from './data';
import type { Calibration, Scenario } from './types';

/** Only atomic support and geography affect calibration; list partition and turnout are excluded. */
export function calibrationFingerprint(scenario: Scenario): string {
  return JSON.stringify([scenario.dataVersion, scenario.modelVersion, scenario.geographyMode, scenario.residual.supportUnits, [...scenario.entities].sort((a, b) => a.id.localeCompare(b.id)).map((entity) => [entity.id, entity.supportUnits, entity.proxyId])]);
}

/** Fit 2023 district row margins and exact national support margins in normalized units. */
export function calibrate(scenario: Scenario, maxIterations = 10000): Calibration {
  const districts = historicalData.districts;
  const totalVotes = historicalData.totals.validVotes2023;
  const entities = [...scenario.entities].sort((a, b) => a.id.localeCompare(b.id));
  const entityIds = [...entities.map((entity) => entity.id), '__residual'];
  const targets = [...entities.map((entity) => entity.supportUnits / SUPPORT_TOTAL), scenario.residual.supportUnits / SUPPORT_TOTAL];
  if (targets.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(targets.reduce((sum, value) => sum + value, 0) - 1) > 1e-14) throw new Error('IPF: udziały muszą sumować się do 100%.');
  const weights = districts.map((district) => district.validVotes2023 / totalVotes);
  const nationalVotes = Object.fromEntries(historicalData.committees.map((committee) => [committee.id, districts.reduce((sum, district) => sum + district.votesByCommittee[committee.id], 0)]));
  const matrix = districts.map((district, row) => targets.map((target, column) => {
    if (target === 0) return 0;
    const proxyId = entities[column]?.proxyId;
    if (proxyId && !nationalVotes[proxyId]) throw new Error('Nieznany lub pusty profil geograficzny.');
    const relative = scenario.geographyMode === 'uniform' || !proxyId ? 1 : (district.votesByCommittee[proxyId] / district.validVotes2023) / (nationalVotes[proxyId] / totalVotes);
    return weights[row] * target * ((1 - REGULARIZATION) * relative + REGULARIZATION);
  }));
  const activeColumns = targets.flatMap((target, column) => target > 0 ? [column] : []);
  let maxError = Infinity;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    for (const column of activeColumns) {
      let sum = 0;
      for (let row = 0; row < matrix.length; row++) sum += matrix[row][column];
      const scale = targets[column] / sum;
      for (let row = 0; row < matrix.length; row++) matrix[row][column] *= scale;
    }
    for (let row = 0; row < matrix.length; row++) {
      const scale = weights[row] / matrix[row].reduce((sum, value) => sum + value, 0);
      for (const column of activeColumns) matrix[row][column] *= scale;
    }
    maxError = 0;
    for (const column of activeColumns) {
      let sum = 0;
      for (let row = 0; row < matrix.length; row++) sum += matrix[row][column];
      maxError = Math.max(maxError, Math.abs(sum - targets[column]));
    }
    for (let row = 0; row < matrix.length; row++) maxError = Math.max(maxError, Math.abs(matrix[row].reduce((sum, value) => sum + value, 0) - weights[row]));
    if (maxError <= IPF_TOLERANCE) return { matrix: matrix.map((values) => values.map((value) => value * totalVotes)), entityIds, iterations: iteration, maxError, fingerprint: calibrationFingerprint(scenario) };
  }
  throw new Error(`Kalibracja IPF nie osiągnęła tolerancji ${IPF_TOLERANCE} po ${maxIterations} iteracjach (błąd ${maxError}).`);
}

/** Pool already calibrated atomic columns, without rerunning IPF or scaling turnout. */
export function poolVotes(scenario: Scenario, calibration: Calibration): Record<string, number>[] {
  if (calibration.fingerprint !== calibrationFingerprint(scenario)) throw new Error('Kalibracja pochodzi z innego scenariusza poparcia lub geografii.');
  const columns = new Map(calibration.entityIds.map((id, index) => [id, index]));
  return calibration.matrix.map((row) => Object.fromEntries(scenario.lists.map((list) => [list.id, list.memberEntityIds.reduce((sum, id) => sum + row[columns.get(id)!], 0)])));
}
