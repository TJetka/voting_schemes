import { SUPPORT_TOTAL } from './constants';
import type { CommitteeType, Eligibility } from './types';

export interface EligibilityInput {
  id: string;
  committeeType: CommitteeType;
  minorityExempt: boolean;
  votes: number;
}

/** Exact integer cross multiplication. Exemptions are applied after the ordinary-qualifier trigger. */
export function determineEligibility(
  lists: EligibilityInput[],
  denominator: number = SUPPORT_TOTAL,
): { eligibility: Record<string, Eligibility>; thresholdRegime: 'normal' | 'fallback' } {
  if (
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    lists.some((list) => !Number.isSafeInteger(list.votes) || list.votes < 0)
  )
    throw new Error('Progi wymagają całkowitych, nieujemnych głosów i dodatniego mianownika.');
  if (lists.reduce((sum, list) => sum + list.votes, 0) > denominator)
    throw new Error('Głosy komitetów przekraczają mianownik.');
  const meets = (list: EligibilityInput, threshold: number): boolean =>
    BigInt(list.votes) * 100n >= BigInt(threshold) * BigInt(denominator);
  const ordinaryQualifiers = lists.filter((list) =>
    meets(list, list.committeeType === 'coalition' ? 8 : 5),
  ).length;
  const fallback = ordinaryQualifiers <= 1;
  const eligibility = Object.fromEntries(
    lists.map((list) => {
      const thresholdPct =
        list.committeeType === 'coalition' ? (fallback ? 5 : 8) : fallback ? 3 : 5;
      const eligible = list.minorityExempt || meets(list, thresholdPct);
      const reason = list.minorityExempt
        ? 'Zwolnienie komitetu mniejszości narodowej'
        : eligible
          ? `Osiągnięto próg ${thresholdPct}%${fallback ? ' (art. 198)' : ''}`
          : `Poniżej progu ${thresholdPct}%${fallback ? ' (art. 198)' : ''}`;
      return [
        list.id,
        {
          eligible,
          thresholdPct,
          reason,
          supportUnits:
            denominator === SUPPORT_TOTAL ? list.votes : (list.votes / denominator) * SUPPORT_TOTAL,
        },
      ];
    }),
  );
  return { eligibility, thresholdRegime: fallback ? 'fallback' : 'normal' };
}
