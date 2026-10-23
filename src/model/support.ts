import { SUPPORT_TOTAL, UNITS_PER_PERCENT } from './constants';
import type { Entity, Scenario } from './types';

/** Parse percentage decimal text exactly, to millionths of a percentage point. */
export function parseSupport(text: string): number {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d{1,3}(?:\.\d{0,6})?$/.test(normalized))
    throw new Error(
      'Poparcie musi być liczbą od 0 do 100, z maksymalnie 6 miejscami po przecinku.',
    );
  const [whole, decimal = ''] = normalized.split('.');
  const units = Number(whole) * UNITS_PER_PERCENT + Number(decimal.padEnd(6, '0'));
  if (units > SUPPORT_TOTAL) throw new Error('Poparcie nie może przekroczyć 100%.');
  return units;
}

export function formatSupport(units: number, maxDecimals = 6): string {
  const decimal = (units / UNITS_PER_PERCENT).toFixed(maxDecimals);
  return decimal.includes('.') ? decimal.replace(/\.?0+$/, '') : decimal;
}

export function defaultDonors(
  scenario: Scenario,
  targetId: string,
  mode: 'all' | 'family' = 'all',
): string[] {
  const target = scenario.entities.find((entity) => entity.id === targetId);
  if (!target) throw new Error('Nieznany podmiot.');
  return scenario.entities
    .filter(
      (entity) =>
        entity.id !== targetId &&
        entity.active &&
        !entity.locked &&
        (mode === 'all' || entity.family === target.family),
    )
    .map((entity) => entity.id);
}

/** Exact largest-remainder proportional division; tie breaks depend on IDs, never row order. */
export function distributeUnits(
  total: number,
  weights: { id: string; weight: number }[],
): Record<string, number> {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    weights.some(({ weight }) => !Number.isSafeInteger(weight) || weight < 0)
  )
    throw new Error('Nieprawidłowe jednostki poparcia.');
  if (new Set(weights.map(({ id }) => id)).size !== weights.length)
    throw new Error('Powtórzony dawca.');
  const weightSum = weights.reduce((sum, { weight }) => sum + BigInt(weight), 0n);
  if (weightSum === 0n) throw new Error('Wybrana pula ma zerowe poparcie. Wybierz innego dawcę.');
  const allocations = weights.map(({ id, weight }) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { id, units: Number(numerator / weightSum), remainder: numerator % weightSum };
  });
  const rest = total - allocations.reduce((sum, allocation) => sum + allocation.units, 0);
  allocations.sort((a, b) =>
    a.remainder === b.remainder ? (a.id < b.id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1,
  );
  for (let index = 0; index < rest; index++) allocations[index].units += 1;
  return Object.fromEntries(allocations.map(({ id, units }) => [id, units]));
}

/** Change one active entity with an explicit donor pool, preserving all 100,000,000 units. */
export function redistributeSupport(
  scenario: Scenario,
  targetId: string,
  targetUnits: number,
  donorIds = defaultDonors(scenario, targetId),
): Scenario {
  if (!Number.isSafeInteger(targetUnits) || targetUnits < 0 || targetUnits > SUPPORT_TOTAL)
    throw new Error('Nieprawidłowe poparcie.');
  const target = scenario.entities.find((entity) => entity.id === targetId);
  if (!target || !target.active) throw new Error('Najpierw aktywuj podmiot.');
  if (target.locked) throw new Error('Podmiot jest zablokowany.');
  if (new Set(donorIds).size !== donorIds.length || donorIds.includes(targetId))
    throw new Error('Pula dawców nie może zawierać powtórzeń ani celu.');
  const donors = donorIds.map((id) => {
    const entity = scenario.entities.find((candidate) => candidate.id === id);
    if (!entity || !entity.active || entity.locked)
      throw new Error(`Dawca ${id} jest nieaktywny, zablokowany lub nieznany.`);
    return entity;
  });
  if (targetUnits === target.supportUnits) return structuredClone(scenario);
  const donorTotal = donors.reduce((sum, entity) => sum + entity.supportUnits, 0);
  const available = target.supportUnits + donorTotal;
  if (targetUnits > available)
    throw new Error(`Za mała pula dawców. Maksymalne poparcie: ${formatSupport(available)}%.`);
  const allocation = distributeUnits(
    available - targetUnits,
    donors.map((entity) => ({ id: entity.id, weight: entity.supportUnits })),
  );
  return {
    ...scenario,
    entities: scenario.entities.map((entity) =>
      entity.id === targetId
        ? { ...entity, supportUnits: targetUnits }
        : entity.id in allocation
          ? { ...entity, supportUnits: allocation[entity.id] }
          : entity,
    ),
    notes: [
      ...scenario.notes,
      `Założenie użytkownika: ${target.label} = ${formatSupport(targetUnits)}%; pula: ${donors.map((entity) => entity.label).join(', ')}.`,
    ].slice(-50),
  };
}

/** Activation adds a zero-support singleton; support must subsequently be explicitly transferred. */
export function setEntityActive(scenario: Scenario, id: string, active: boolean): Scenario {
  const entity = scenario.entities.find((candidate) => candidate.id === id);
  if (!entity) throw new Error('Nieznany podmiot.');
  if (entity.active === active) return structuredClone(scenario);
  if (!active && entity.supportUnits > 0)
    throw new Error('Przed dezaktywacją przenieś całe poparcie tego podmiotu.');
  const lists = active
    ? [
        ...scenario.lists,
        { id, memberEntityIds: [id], committeeType: 'ordinary' as const, minorityExempt: false },
      ]
    : scenario.lists.flatMap((list) => {
        const members = list.memberEntityIds.filter((member) => member !== id);
        return members.length
          ? [{ ...list, id: [...members].sort().join('+'), memberEntityIds: members }]
          : [];
      });
  const retained = lists
    .filter((list) => scenario.lists.some((old) => old.id === list.id))
    .map((list) => list.id);
  return {
    ...scenario,
    entities: scenario.entities.map((candidate) =>
      candidate.id === id ? { ...candidate, active } : candidate,
    ),
    lists,
    allianceSelection: scenario.allianceSelection.filter((listId) => retained.includes(listId)),
    notes: [...scenario.notes, 'Zmiana aktywności: sprawdź wybór sojuszu parlamentarnego.'],
  };
}

/** Divide selected active slots equally, retaining their combined support exactly. */
export function equalizeSupport(scenario: Scenario, ids: string[]): Scenario {
  if (ids.length < 2 || new Set(ids).size !== ids.length)
    throw new Error('Wybierz co najmniej dwa różne podmioty.');
  const selected: Entity[] = ids.map((id) => {
    const entity = scenario.entities.find((candidate) => candidate.id === id);
    if (!entity?.active || entity.locked)
      throw new Error('Wybrane podmioty muszą być aktywne i odblokowane.');
    return entity;
  });
  if (new Set(selected.map((entity) => entity.family)).size !== 1)
    throw new Error('Równy podział zachowuje sumę jednej grupy.');
  const allocation = distributeUnits(
    selected.reduce((sum, entity) => sum + entity.supportUnits, 0),
    ids.map((id) => ({ id, weight: 1 })),
  );
  return {
    ...scenario,
    entities: scenario.entities.map((entity) =>
      entity.id in allocation ? { ...entity, supportUnits: allocation[entity.id] } : entity,
    ),
    notes: [
      ...scenario.notes,
      'Eksperyment syntetyczny: równy podział poparcia w wybranych podmiotach grupy.',
    ],
  };
}
