import { SUPPORT_TOTAL } from './constants';
import { historicalData } from './data';
import { calibrationFingerprint, HISTORICAL_FAMILY_PROXIES } from './geography';
import type { Calibration, Family, Scenario } from './types';

export const REGIONAL_FAMILIES = ['L', 'R', 'C'] as const;

export interface RegionalDistrict {
  districtId: number;
  historicalShares: Record<Family, number>;
  projectedShares: Record<Family, number>;
}

export interface RegionalSummary {
  districts: RegionalDistrict[];
  families: Record<
    Family,
    { targetShare: number; projectedShare: number; minShare: number; maxShare: number }
  >;
  national: {
    id: string;
    label: string;
    publishedShare: number | null;
    targetShare: number;
    projectedShare: number;
  }[];
  maxError: number;
}

/** Summarize atomic electorates, independently of list alliances. All shares are fractions. */
export function summarizeRegionalSupport(
  scenario: Scenario,
  calibration: Calibration,
): RegionalSummary {
  if (calibration.fingerprint !== calibrationFingerprint(scenario))
    throw new Error('Podsumowanie geografii wymaga kalibracji bieżącego scenariusza.');
  const total = historicalData.totals.validVotes2023;
  const columns = new Map(calibration.entityIds.map((id, index) => [id, index]));
  const familyColumns = Object.fromEntries(
    REGIONAL_FAMILIES.map((family) => [
      family,
      scenario.entities
        .filter((entity) => entity.family === family)
        .map((entity) => columns.get(entity.id)!),
    ]),
  ) as Record<Family, number[]>;
  const districts = historicalData.districts.map((district, row) => ({
    districtId: district.id,
    historicalShares: Object.fromEntries(
      REGIONAL_FAMILIES.map((family) => [
        family,
        HISTORICAL_FAMILY_PROXIES[family].reduce(
          (sum, id) => sum + district.votesByCommittee[id],
          0,
        ) / district.validVotes2023,
      ]),
    ) as Record<Family, number>,
    projectedShares: Object.fromEntries(
      REGIONAL_FAMILIES.map((family) => [
        family,
        familyColumns[family].reduce((sum, column) => sum + calibration.matrix[row][column], 0) /
          district.validVotes2023,
      ]),
    ) as Record<Family, number>,
  }));
  const national = [
    ...scenario.entities.map((entity) => ({
      id: entity.id,
      label: entity.label,
      publishedShare:
        entity.publishedPollSharePct === null ? null : entity.publishedPollSharePct / 100,
      targetShare: entity.supportUnits / SUPPORT_TOTAL,
      projectedShare:
        calibration.matrix.reduce((sum, row) => sum + row[columns.get(entity.id)!], 0) / total,
    })),
    {
      id: '__residual',
      label: 'Reszta (poza podmiotami)',
      publishedShare:
        scenario.residual.components.reduce((sum, item) => sum + item.publishedSharePct, 0) / 100,
      targetShare: scenario.residual.supportUnits / SUPPORT_TOTAL,
      projectedShare:
        calibration.matrix.reduce((sum, row) => sum + row[columns.get('__residual')!], 0) / total,
    },
  ];
  return {
    districts,
    national,
    maxError: Math.max(...national.map((item) => Math.abs(item.targetShare - item.projectedShare))),
    families: Object.fromEntries(
      REGIONAL_FAMILIES.map((family) => [
        family,
        {
          targetShare:
            scenario.entities
              .filter((entity) => entity.family === family)
              .reduce((sum, entity) => sum + entity.supportUnits, 0) / SUPPORT_TOTAL,
          projectedShare:
            calibration.matrix.reduce(
              (sum, row) =>
                sum + familyColumns[family].reduce((value, column) => value + row[column], 0),
              0,
            ) / total,
          minShare: Math.min(...districts.map((district) => district.projectedShares[family])),
          maxShare: Math.max(...districts.map((district) => district.projectedShares[family])),
        },
      ]),
    ) as RegionalSummary['families'],
  };
}
