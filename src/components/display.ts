import type { ElectoralList, Scenario, SeatBounds } from '../model/types';

export const number = (value: number, digits = 0): string => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: digits }).format(value);
export const percent = (value: number, digits = 2): string => `${number(value, digits)}%`;
export const boundsText = (value: SeatBounds): string => value.lower === value.upper ? String(value.lower) : `${value.lower}–${value.upper}`;
export const signed = (value: number): string => value > 0 ? `+${value}` : String(value);
export const listLabel = (scenario: Scenario, list: ElectoralList): string => list.memberEntityIds.map((id) => scenario.entities.find((entity) => entity.id === id)?.label ?? id).join(' + ');
export const shortName = (id: string): string => ({ ko: 'KO', nl: 'NL', razem: 'Razem', pps: 'PPS', pis: 'PiS', konf: 'Konfederacja', kkp: 'KKP', rozwoj: 'Rozwój Plus', psl: 'PSL', pl2050: 'Polska 2050', td: 'Trzecia Droga' })[id] ?? id;
export const listShort = (list: ElectoralList): string => list.memberEntityIds.map(shortName).join(' + ');
export const errorText = (error: unknown): string => error instanceof Error ? error.message : 'Nie udało się wykonać tej operacji.';

export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
