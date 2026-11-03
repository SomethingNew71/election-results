import type { RaceKind } from '../types'

export interface ElectionRules {
  /** A candidate under 50% goes to a runoff (Georgia, Louisiana, the territories). */
  majority: boolean
  /** Ranked-choice tabulation follows when no one has 50% of first choices. */
  rcv: boolean
}

/**
 * Guam, the U.S. Virgin Islands, American Samoa and the Northern Mariana
 * Islands hold a runoff when no candidate for governor or delegate gets a
 * majority. Treating all four as majority races only stops an early
 * "Out of reach" below 50%. No runoff dates are listed for them.
 */
const MAJORITY_STATES = new Set(['GA', 'LA', 'GU', 'VI', 'AS', 'MP'])

export function rulesFor(state: string, kind: RaceKind): ElectionRules {
  return {
    majority: MAJORITY_STATES.has(state),
    // Alaska uses RCV for all general elections; Maine for federal ones.
    rcv: state === 'AK' || (state === 'ME' && kind !== 'governor'),
  }
}

/**
 * Runoff dates when no candidate reaches 50%. Georgia: all offices, 1 Dec 2026
 * (georgia.gov). Louisiana: the 3 Nov House races are an open primary after
 * the 2026 redistricting, with a runoff on 12 Dec 2026 (The Green Papers;
 * confirm with sos.la.gov). Louisiana's Senate race has two candidates.
 */
export const RUNOFF_DATES: Record<string, { date: string; kinds: RaceKind[] }> = {
  GA: { date: '2026-12-01', kinds: ['senate', 'governor', 'house'] },
  LA: { date: '2026-12-12', kinds: ['house'] },
}

export function runoffDate(state: string, kind: RaceKind): string | null {
  const r = RUNOFF_DATES[state]
  return r && r.kinds.includes(kind) ? r.date : null
}
