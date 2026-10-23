import type { CommitteeType, ElectoralList, Entity, Family, Scenario } from './types';

export function canonicalListId(ids: string[]): string {
  return [...ids].sort().join('+');
}

export function listFamily(list: ElectoralList, entities: Entity[]): Family {
  const families = new Set(
    list.memberEntityIds.map((id) => entities.find((entity) => entity.id === id)?.family),
  );
  if (families.has(undefined) || (families.has('L') && families.has('R')))
    throw new Error('Wspólna lista nie może łączyć grup L i R, także przez centrum.');
  return families.has('L') ? 'L' : families.has('R') ? 'R' : 'C';
}

function applyPartition(scenario: Scenario, lists: ElectoralList[]): Scenario {
  const oldIds = new Set(scenario.lists.map((list) => list.id));
  const retained = new Set(lists.filter((list) => oldIds.has(list.id)).map((list) => list.id));
  return {
    ...scenario,
    lists: lists.sort((a, b) => a.id.localeCompare(b.id)),
    allianceSelection: scenario.allianceSelection.filter((id) => retained.has(id)),
    notes: [
      ...scenario.notes,
      'Zmieniono układ list. Sprawdź ponownie wybór sojuszu parlamentarnego.',
    ].slice(-50),
  };
}

/** Create a common list (8% by default). To edit a destination's membership, pass its existing type; unchanged lists and leftover fragments retain their type. */
export function mergeEntities(
  scenario: Scenario,
  memberIds: string[],
  committeeType?: CommitteeType,
): Scenario {
  if (memberIds.length < 2 || new Set(memberIds).size !== memberIds.length)
    throw new Error('Wybierz co najmniej dwa różne podmioty.');
  if (
    memberIds.some((id) => !scenario.entities.some((entity) => entity.id === id && entity.active))
  )
    throw new Error('Można łączyć tylko aktywne podmioty.');
  const id = canonicalListId(memberIds);
  const establishedType = scenario.lists.find((list) => list.id === id)?.committeeType;
  const merged: ElectoralList = {
    id,
    memberEntityIds: [...memberIds].sort(),
    committeeType: committeeType ?? establishedType ?? 'coalition',
    minorityExempt: false,
  };
  listFamily(merged, scenario.entities);
  const lists = scenario.lists.flatMap((list) => {
    const members = list.memberEntityIds.filter((id) => !memberIds.includes(id));
    return members.length
      ? [{ ...list, id: canonicalListId(members), memberEntityIds: members }]
      : [];
  });
  lists.push(merged);
  return applyPartition(scenario, lists);
}

export function splitEntity(scenario: Scenario, entityId: string): Scenario {
  const old = scenario.lists.find((list) => list.memberEntityIds.includes(entityId));
  if (!old) throw new Error('Nieznany aktywny podmiot.');
  if (old.memberEntityIds.length === 1) return structuredClone(scenario);
  const remaining = old.memberEntityIds.filter((id) => id !== entityId);
  const lists = scenario.lists.filter((list) => list !== old);
  lists.push({ ...old, id: canonicalListId(remaining), memberEntityIds: remaining });
  lists.push({
    id: entityId,
    memberEntityIds: [entityId],
    committeeType: 'ordinary',
    minorityExempt: false,
  });
  return applyPartition(scenario, lists);
}

export function separateAll(scenario: Scenario): Scenario {
  return applyPartition(
    scenario,
    scenario.entities
      .filter((entity) => entity.active)
      .map((entity) => ({
        id: entity.id,
        memberEntityIds: [entity.id],
        committeeType: 'ordinary',
        minorityExempt: false,
      })),
  );
}

/** Enumerate each permitted active set partition exactly once via restricted-growth recursion. */
export function enumeratePartitions(entities: Entity[]): string[][][] {
  const active = entities
    .filter((entity) => entity.active)
    .sort((a, b) => a.id.localeCompare(b.id));
  const partitions: string[][][] = [];
  const blocks: { ids: string[]; families: Set<Family> }[] = [];
  function visit(index: number): void {
    if (index === active.length) {
      partitions.push(
        blocks
          .map((block) => [...block.ids].sort())
          .sort((a, b) => canonicalListId(a).localeCompare(canonicalListId(b))),
      );
      return;
    }
    const entity = active[index];
    for (const block of blocks) {
      if (
        (entity.family === 'L' && block.families.has('R')) ||
        (entity.family === 'R' && block.families.has('L'))
      )
        continue;
      const already = block.families.has(entity.family);
      block.ids.push(entity.id);
      block.families.add(entity.family);
      visit(index + 1);
      block.ids.pop();
      if (!already) block.families.delete(entity.family);
    }
    blocks.push({ ids: [entity.id], families: new Set([entity.family]) });
    visit(index + 1);
    blocks.pop();
  }
  visit(0);
  return partitions;
}

export function partitionLists(partition: string[][], policy: CommitteeType): ElectoralList[] {
  return partition.map((members) => ({
    id: canonicalListId(members),
    memberEntityIds: [...members].sort(),
    committeeType: members.length > 1 ? policy : 'ordinary',
    minorityExempt: false,
  }));
}

/** Stable identity independent of object-key or set-member order; note order and text remain meaningful. */
export function scenarioFingerprint(scenario: Scenario): string {
  const canonical = {
    schemaVersion: scenario.schemaVersion,
    modelVersion: scenario.modelVersion,
    dataVersion: scenario.dataVersion,
    pollId: scenario.pollId,
    name: scenario.name,
    entities: [...scenario.entities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entity) => ({
        id: entity.id,
        label: entity.label,
        family: entity.family,
        active: entity.active,
        supportUnits: entity.supportUnits,
        publishedPollSharePct: entity.publishedPollSharePct,
        supportStatus: entity.supportStatus,
        proxyId: entity.proxyId,
        locked: entity.locked,
      })),
    lists: [...scenario.lists]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((list) => ({
        id: list.id,
        memberEntityIds: [...list.memberEntityIds].sort(),
        committeeType: list.committeeType,
        minorityExempt: list.minorityExempt,
      })),
    residual: {
      supportUnits: scenario.residual.supportUnits,
      components: [...scenario.residual.components]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((component) => ({
          label: component.label,
          publishedSharePct: component.publishedSharePct,
        })),
      eligibilityAssumption: scenario.residual.eligibilityAssumption,
    },
    turnout: scenario.turnout,
    geographyMode: scenario.geographyMode,
    allianceSelection: [...scenario.allianceSelection].sort(),
    notes: [...scenario.notes],
    familyLabels: {
      L: scenario.familyLabels.L,
      R: scenario.familyLabels.R,
      C: scenario.familyLabels.C,
    },
  };
  return JSON.stringify(canonical);
}
