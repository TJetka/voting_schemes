import { QUOTIENT_TOLERANCE } from './constants';
import type { DistrictAllocation, Quotient, SeatBounds, UnresolvedBoundary } from './types';

function exactCompare(a: Quotient, b: Quotient): number {
  const left = BigInt(a.votes) * BigInt(b.divisor);
  const right = BigInt(b.votes) * BigInt(a.divisor);
  if (left !== right) return left > right ? -1 : 1;
  if (a.votes !== b.votes) return a.votes > b.votes ? -1 : 1;
  return a.listId.localeCompare(b.listId);
}

function projectedCompare(a: Quotient, b: Quotient): number {
  // A strict ordering; tolerance is inspected afterward against ONE cutoff, never in this comparator.
  return b.value - a.value || a.listId.localeCompare(b.listId) || a.divisor - b.divisor;
}

function sharesBoundary(a: Quotient, cutoff: Quotient, exact: boolean): boolean {
  if (exact) return BigInt(a.votes) * BigInt(cutoff.divisor) === BigInt(cutoff.votes) * BigInt(a.divisor) && a.votes === cutoff.votes;
  const left = a.votes * cutoff.divisor;
  const right = cutoff.votes * a.divisor;
  return Math.abs(left - right) <= QUOTIENT_TOLERANCE * Math.max(Math.abs(left), Math.abs(right));
}

/** d'Hondt on positive eligible votes. Exact replay applies district-total tie-breaks; projected near ties remain numerical bounds. */
export function allocateDistrict(votesByList: Record<string, number>, seats: number, districtId = 0, exact = false): DistrictAllocation {
  if (!Number.isSafeInteger(seats) || seats <= 0 || Object.values(votesByList).some((votes) => !Number.isFinite(votes) || votes < 0 || (exact && !Number.isSafeInteger(votes)))) throw new Error('Nieprawidłowe głosy lub liczba mandatów okręgu.');
  const ids = Object.keys(votesByList).sort();
  const seatsByList: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const candidates: Quotient[] = [];
  for (const id of ids) {
    if (votesByList[id] <= 0) continue;
    for (let divisor = 1; divisor <= seats + 1; divisor++) candidates.push({ listId: id, votes: votesByList[id], divisor, value: votesByList[id] / divisor, awarded: false });
  }
  if (!candidates.length) return { districtId, status: 'unallocatable', seatsByList, seatBounds: Object.fromEntries(ids.map((id) => [id, { lower: 0, upper: 0 }])), votesByList, trace: [], lastWinning: null, firstLosing: null, quotientGap: null, unresolved: null };
  candidates.sort(exact ? exactCompare : projectedCompare);
  const cutoff = candidates[seats - 1];
  let start = seats - 1;
  let end = seats;
  while (start > 0 && sharesBoundary(candidates[start - 1], cutoff, exact)) start--;
  while (end < candidates.length && sharesBoundary(candidates[end], cutoff, exact)) end++;
  const ambiguous = end > seats;
  const guaranteed = ambiguous ? start : seats;
  for (let index = 0; index < guaranteed; index++) {
    candidates[index].awarded = true;
    seatsByList[candidates[index].listId]++;
  }
  const unresolved: UnresolvedBoundary | null = ambiguous ? { seats: seats - start, listIds: [...new Set(candidates.slice(start, end).map((candidate) => candidate.listId))], reason: exact ? 'precinct-tie' : 'numerical' } : null;
  const seatBounds = Object.fromEntries(ids.map((id) => [id, { lower: seatsByList[id], upper: seatsByList[id] + (unresolved?.listIds.includes(id) ? 1 : 0) }]));
  return { districtId, status: ambiguous ? 'ambiguous' : 'resolved', seatsByList, seatBounds, votesByList, trace: candidates, lastWinning: cutoff, firstLosing: candidates[seats] ?? null, quotientGap: candidates[seats] ? cutoff.value - candidates[seats].value : null, unresolved };
}

/** Joint bounds respect the shared cutoff constraint; marginal list upper bounds must not be summed. */
export function districtAllianceBounds(allocation: DistrictAllocation, selectedIds: readonly string[]): SeatBounds {
  const selected = new Set(selectedIds);
  const guaranteed = Object.entries(allocation.seatsByList).reduce((sum, [id, seats]) => sum + (selected.has(id) ? seats : 0), 0);
  if (!allocation.unresolved) return { lower: guaranteed, upper: guaranteed };
  const { listIds, seats } = allocation.unresolved;
  const selectedContenders = listIds.filter((id) => selected.has(id)).length;
  return { lower: guaranteed + Math.max(0, seats - (listIds.length - selectedContenders)), upper: guaranteed + Math.min(seats, selectedContenders) };
}
