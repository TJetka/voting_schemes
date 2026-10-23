import { validateScenario } from './validation';
import { scenarioFingerprint } from './coalitions';
import { baselineTurnout } from './data';
import type { Result, Scenario } from './types';

export const STORAGE_KEY = 'laboratorium-koalicji:scenario:v1';
const MAX_STATE_BYTES = 100_000;
const SCENARIO_KEYS = [
  'schemaVersion',
  'modelVersion',
  'dataVersion',
  'pollId',
  'name',
  'entities',
  'lists',
  'residual',
  'turnout',
  'geographyMode',
  'allianceSelection',
  'notes',
  'familyLabels',
];
export const LIMITATIONS = [
  'Model scenariuszowy, nie prognoza ani prawdopodobieństwo wyniku wyborów.',
  'Poparcie w okręgach jest przybliżeniem opartym na 2023 r.; część podmiotów dzieli profile historyczne.',
  'Zamrożono elektorat i podział 460 mandatów z 2023 r.; głosy zagraniczne są już w okręgu 19.',
  'Sondaż jest datowany; tryb badania i sposób traktowania niezdecydowanych nie zostały podane.',
  'Grupy L/R/C i wspólna lista wspierająca dany obóz są założeniami scenariusza.',
  'Połączenie list zachowuje wszystkie głosy; bez efektów kandydatów, kampanii i reakcji wyborców.',
  'Mandaty wspólnej listy nie określają mandatów jej poszczególnych podmiotów.',
  'Proporcjonalna frekwencja nie modeluje przewagi mobilizacyjnej.',
  'Zablokowana reszta 0,51% pozostaje w mianowniku i nie uzyskuje mandatów.',
  'Próbkowanie wrażliwości może pominąć przejścia wewnątrz przedziałów.',
  'Wyczerpujące porównanie dotyczy zadanych reguł łączenia i wspólnej polityki progowej.',
];

/** Export inputs only; provenance is descriptive and never overrides validated model inputs. */
export function serializeScenario(scenario: Scenario): string {
  validateScenario(scenario);
  const text = JSON.stringify(
    {
      ...scenario,
      provenance: {
        regularizer: 0.01,
        limitations: LIMITATIONS,
        sourceManifest: 'src/data/source-manifest.json',
      },
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).length > MAX_STATE_BYTES)
    throw new Error('Scenariusz jest zbyt duży (limit 100 kB). Skróć notatki.');
  return text;
}

export function parseScenario(text: string): Scenario {
  if (new TextEncoder().encode(text).length > MAX_STATE_BYTES)
    throw new Error('Plik scenariusza jest zbyt duży (limit 100 kB).');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('Nie można odczytać JSON scenariusza.');
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return validateScenario(input);
  const record = input as Record<string, unknown>;
  const unexpected = Object.keys(record).find(
    (key) => key !== 'provenance' && !SCENARIO_KEYS.includes(key),
  );
  if (unexpected)
    throw new Error(
      `Nieznane pole scenariusza: ${unexpected}. Wyniki pochodne nie są danymi wejściowymi.`,
    );
  // Exported provenance is descriptive, not an extra authoritative input or fingerprint component.
  return validateScenario(Object.fromEntries(SCENARIO_KEYS.map((key) => [key, record[key]])));
}

/** Compact versioned UTF-8 state in the hash, preserving the GitHub Pages path. */
export function scenarioToHash(scenario: Scenario): string {
  validateScenario(scenario);
  const compact = JSON.stringify(scenario);
  const bytes = new TextEncoder().encode(compact);
  const hash =
    '#s=' +
    btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  if (hash.length > MAX_STATE_BYTES)
    throw new Error('Scenariusz jest zbyt duży do linku. Skróć notatki lub wyeksportuj JSON.');
  return hash;
}

export function scenarioFromHash(hash: string): Scenario {
  if (!/^#s=[A-Za-z0-9_-]+$/.test(hash) || hash.length > MAX_STATE_BYTES)
    throw new Error('Nieprawidłowy link scenariusza.');
  try {
    const bytes = Uint8Array.from(
      atob(hash.slice(3).replace(/-/g, '+').replace(/_/g, '/')),
      (character) => character.charCodeAt(0),
    );
    return parseScenario(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `Nie można odtworzyć linku: ${error instanceof Error ? error.message : 'uszkodzone dane'}`,
    );
  }
}

export function loadScenario(): Scenario | null {
  if (window.location.hash.startsWith('#s=')) return scenarioFromHash(window.location.hash);
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? parseScenario(saved) : null;
}
export function saveScenario(scenario: Scenario): void {
  localStorage.setItem(STORAGE_KEY, serializeScenario(scenario));
}

/** Deterministic, non-cryptographic display identifier; complete inputs remain in JSON. */
export function scenarioId(scenario: Scenario): string {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(scenarioFingerprint(scenario)))
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** CSV contains national and district rows, versions, exact support and conservative seat bounds. */
export function exportResultsCsv(scenario: Scenario, result: Result): string {
  const columns = [
    'scenario_id',
    'model_version',
    'data_version',
    'geography',
    'turnout',
    'district_id',
    'list_id',
    'members',
    'committee_type',
    'national_support_pct',
    'eligible',
    'threshold_pct',
    'seats_lower',
    'seats_upper',
    'expected_votes',
    'status',
  ];
  const rows: (string | number)[][] = [columns];
  const id = scenarioId(scenario);
  const prefix = [
    id,
    scenario.modelVersion,
    scenario.dataVersion,
    scenario.geographyMode,
    scenario.turnout,
  ];
  const turnoutScale = scenario.turnout / baselineTurnout;
  for (const list of scenario.lists) {
    const support =
      list.memberEntityIds.reduce(
        (sum, member) =>
          sum + scenario.entities.find((entity) => entity.id === member)!.supportUnits,
        0,
      ) / 1e6;
    const shared = [
      list.id,
      list.memberEntityIds.join(' + '),
      list.committeeType,
      support,
      String(result.eligibility[list.id].eligible),
      result.eligibility[list.id].thresholdPct,
    ];
    const bounds = result.nationalListSeatBounds[list.id];
    const nationalVotes =
      result.districtAllocations.reduce(
        (sum, district) => sum + (district.votesByList[list.id] ?? 0),
        0,
      ) * turnoutScale;
    rows.push([
      ...prefix,
      'national',
      ...shared,
      bounds.lower,
      bounds.upper,
      nationalVotes,
      result.status,
    ]);
    for (const district of result.districtAllocations) {
      const seats = district.seatBounds[list.id] ?? { lower: 0, upper: 0 };
      rows.push([
        ...prefix,
        district.districtId,
        ...shared,
        seats.lower,
        seats.upper,
        (district.votesByList[list.id] ?? 0) * turnoutScale,
        district.status,
      ]);
    }
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
