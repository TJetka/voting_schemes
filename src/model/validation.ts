import { DATA_VERSION, ENTITY_IDS, MODEL_VERSION, PROXY_IDS, RESIDUAL_UNITS, SUPPORT_TOTAL } from './constants';
import { canonicalListId, listFamily } from './coalitions';
import { maxTurnout } from './data';
import { createDefaultScenario } from './presets';
import type { Scenario } from './types';

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function label(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 200; }
function safeUnits(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= SUPPORT_TOTAL; }
function fail(message: string): never { throw new Error(`Nieprawidłowy scenariusz: ${message}`); }

/** Validate untrusted JSON, including every input that can affect reproducible results. */
export function validateScenario(input: unknown): Scenario {
  if (!record(input)) fail('oczekiwano obiektu JSON.');
  if (input.schemaVersion !== 1 || input.modelVersion !== MODEL_VERSION || input.dataVersion !== DATA_VERSION) fail('niezgodna wersja schematu, modelu lub danych.');
  if (!label(input.name) || !label(input.pollId)) fail('brak nazwy lub identyfikatora sondażu.');
  if (input.pollId !== 'pollster-2026-10-19-21') fail('nieznany sondaż.');
  if (typeof input.turnout !== 'number' || !Number.isFinite(input.turnout) || input.turnout <= 0 || input.turnout > maxTurnout) fail('frekwencja musi być dodatnia i nie przekraczać limitu modelu proporcjonalnego.');
  if (input.geographyMode !== 'historical' && input.geographyMode !== 'uniform') fail('nieznany model geografii.');
  if (!record(input.familyLabels) || !['L', 'R', 'C'].every((family) => label((input.familyLabels as Record<string, unknown>)[family]))) fail('brak nazw grup.');
  if (!Array.isArray(input.notes) || input.notes.length > 100 || !input.notes.every((note) => typeof note === 'string' && note.length <= 2000)) fail('nieprawidłowe notatki.');
  if (!Array.isArray(input.entities) || input.entities.length !== 10) fail('wymagane jest dziesięć podmiotów.');
  const defaults = createDefaultScenario();
  const seen = new Set<string>();
  for (const entity of input.entities) {
    if (!record(entity) || typeof entity.id !== 'string' || !(ENTITY_IDS as readonly string[]).includes(entity.id) || seen.has(entity.id)) fail('nieznane lub powtórzone ID podmiotu.');
    seen.add(entity.id);
    const original = defaults.entities.find((candidate) => candidate.id === entity.id)!;
    if (!label(entity.label) || entity.family !== original.family) fail('nieprawidłowa nazwa lub grupa podmiotu.');
    if (!safeUnits(entity.supportUnits) || typeof entity.active !== 'boolean' || typeof entity.locked !== 'boolean' || (!entity.active && entity.supportUnits !== 0)) fail('nieaktywny podmiot musi mieć zero poparcia; udziały muszą być całkowite.');
    if (typeof entity.proxyId !== 'string' || !(PROXY_IDS as readonly string[]).includes(entity.proxyId)) fail('nieznany profil geograficzny.');
    if (entity.publishedPollSharePct !== original.publishedPollSharePct || entity.supportStatus !== original.supportStatus) fail('opublikowane dane sondażu są niezmienne.');
  }
  if (!record(input.residual) || input.residual.supportUnits !== RESIDUAL_UNITS || input.residual.eligibilityAssumption !== 'no-seats') fail('reszta musi pozostać zablokowana na 0,51%.');
  if (JSON.stringify(input.residual.components) !== JSON.stringify(defaults.residual.components)) fail('składniki reszty muszą zachować opublikowane wartości.');
  const scenario = input as unknown as Scenario;
  if (scenario.entities.reduce((sum, entity) => sum + entity.supportUnits, scenario.residual.supportUnits) !== SUPPORT_TOTAL) fail('poparcie wraz z resztą musi wynosić dokładnie 100%.');
  if (!Array.isArray(input.lists) || input.lists.length < 1 || input.lists.length > 10) fail('nieprawidłowa liczba list.');
  const listIds = new Set<string>();
  const assigned = new Set<string>();
  for (const list of input.lists) {
    if (!record(list) || !Array.isArray(list.memberEntityIds) || list.memberEntityIds.length < 1 || list.memberEntityIds.length > 10 || !list.memberEntityIds.every((id) => typeof id === 'string')) fail('lista musi zawierać podmioty.');
    const ids = list.memberEntityIds as string[];
    if (typeof list.id !== 'string' || list.id !== canonicalListId(ids) || listIds.has(list.id)) fail('nieprawidłowe lub powtórzone ID listy.');
    listIds.add(list.id);
    if (list.committeeType !== 'ordinary' && list.committeeType !== 'coalition') fail('nieznany rodzaj komitetu.');
    if (list.minorityExempt !== false) fail('dziesięć podmiotów scenariusza nie ma zwolnienia mniejszości narodowej.');
    for (const id of ids) {
      if (assigned.has(id) || !scenario.entities.some((entity) => entity.id === id && entity.active)) fail('każdy aktywny podmiot musi występować dokładnie raz.');
      assigned.add(id);
    }
    listFamily(list as unknown as Scenario['lists'][number], scenario.entities);
  }
  if (assigned.size !== scenario.entities.filter((entity) => entity.active).length) fail('brak listy dla aktywnego podmiotu.');
  if (!Array.isArray(input.allianceSelection) || new Set(input.allianceSelection).size !== input.allianceSelection.length || !input.allianceSelection.every((id) => typeof id === 'string' && listIds.has(id))) fail('sojusz zawiera nieistniejącą lub powtórzoną listę.');
  return structuredClone(scenario);
}
