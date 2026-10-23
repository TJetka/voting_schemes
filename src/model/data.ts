import historical from '../data/historical.json';
import type { HistoricalData } from './types';

export const historicalData = historical as HistoricalData;
export const baselineTurnout = historicalData.totals.ballots2023 / historicalData.totals.eligible2023;
export const maxTurnout = baselineTurnout * Math.min(...historicalData.districts.map((district) => district.eligible2023 / district.ballots2023));
export const maxTurnoutSliderPct = Math.floor(maxTurnout * 10000) / 100;
