import { baselineTurnout } from './data';
import { DATA_VERSION, MODEL_VERSION, RESIDUAL_UNITS } from './constants';
import type { Entity, Family, PollSnapshot, Scenario } from './types';

export const pollSnapshot: PollSnapshot = {
  id: 'pollster-2026-10-19-21', pollster: 'Pollster', fieldworkStart: '2026-10-19',
  fieldworkEnd: '2026-10-21', publicationDate: '2026-10-22', sampleSize: 1014,
  mode: null, undecidedTreatment: null,
  sourceUrls: [
    'https://zero.pl/news/nowy-sondaz-partyjny-ko-prowadzi-psl-i-polska-2050-pod-progiem',
    'https://wiadomosci.onet.pl/kraj/ko-prowadzi-w-sondazu-wyborczym-duza-przewaga-nad-pis/txqdtnb',
  ],
  rawResponses: { ko: 33.54, nl: 7.77, razem: 5.14, pis: 22.06, konf: 12.18, kkp: 8.03, rozwoj: 5.61, psl: 3.44, pl2050: 1.72, uniaCentrum: 0.15, other: 0.36 },
  denominatorConvention: 'Opublikowany rozkład interpretujemy jako udziały ważnych głosów na listy. To konwencja scenariusza, nie ustalenie metodologii sondażu.',
  lastVerified: '2026-10-23',
};

const definitions: [string, string, Family, number, string][] = [
  ['ko', 'Koalicja Obywatelska', 'L', 33_540_000, 'ko'],
  ['nl', 'Nowa Lewica', 'L', 7_770_000, 'nl'],
  ['razem', 'Partia Razem', 'L', 5_140_000, 'nl'],
  ['pps', 'Polska Partia Socjalistyczna', 'L', 0, 'nl'],
  ['pis', 'Prawo i Sprawiedliwość', 'R', 22_060_000, 'pis'],
  ['konf', 'Konfederacja Wolność i Niepodległość', 'R', 12_180_000, 'konf'],
  ['kkp', 'Konfederacja Korony Polskiej', 'R', 8_030_000, 'konf'],
  ['rozwoj', 'Rozwój Plus', 'R', 5_610_000, 'pis'],
  ['psl', 'Polskie Stronnictwo Ludowe', 'C', 3_440_000, 'td'],
  ['pl2050', 'Polska 2050', 'C', 1_720_000, 'td'],
];

/** Return a fresh, dated scenario; published shares never change with editing. */
export function createDefaultScenario(): Scenario {
  const entities: Entity[] = definitions.map(([id, label, family, supportUnits, proxyId]) => ({
    id, label, family, supportUnits, proxyId, active: id !== 'pps', locked: false,
    publishedPollSharePct: id === 'pps' ? null : supportUnits / 1_000_000,
    supportStatus: id === 'pps' ? 'unmeasured' : 'measured',
  }));
  return {
    schemaVersion: 1, modelVersion: MODEL_VERSION, dataVersion: DATA_VERSION,
    pollId: pollSnapshot.id, name: 'Pollster · 19–21 października 2026', entities,
    lists: entities.filter((entity) => entity.active).map((entity) => ({ id: entity.id, memberEntityIds: [entity.id], committeeType: 'ordinary', minorityExempt: false })),
    residual: { supportUnits: RESIDUAL_UNITS, components: [{ label: 'Unia Centrum', publishedSharePct: 0.15 }, { label: 'Inne', publishedSharePct: 0.36 }], eligibilityAssumption: 'no-seats' },
    turnout: baselineTurnout, geographyMode: 'historical', allianceSelection: [], notes: [],
    familyLabels: { L: 'Lewica / liberałowie — grupa scenariusza', R: 'Prawica — grupa scenariusza', C: 'Centrum — grupa scenariusza' },
  };
}

/** Synthetic demonstration: transfer exactly one percentage point from NL to PPS. */
export function createSyntheticScenario(): Scenario {
  const scenario = createDefaultScenario();
  scenario.name = 'Dziesięć podmiotów — scenariusz syntetyczny';
  scenario.entities = scenario.entities.map((entity) => entity.id === 'nl'
    ? { ...entity, supportUnits: entity.supportUnits - 1_000_000 }
    : entity.id === 'pps' ? { ...entity, active: true, supportUnits: 1_000_000 } : entity);
  scenario.lists.push({ id: 'pps', memberEntityIds: ['pps'], committeeType: 'ordinary', minorityExempt: false });
  scenario.notes = ['Eksperyment syntetyczny: przeniesiono 1 p.p. z NL do PPS; suma grupy L bez zmian.'];
  return scenario;
}
