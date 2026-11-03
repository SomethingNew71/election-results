import type { RaceKind } from '../types'

export interface ElectionRules {
  /** A candidate under 50% goes to a runoff (Georgia, Louisiana). */
  majority: boolean
  /** Ranked-choice tabulation follows when no one has 50% of first choices. */
  rcv: boolean
}

const MAJORITY_STATES = new Set(['GA', 'LA'])

export function rulesFor(state: string, kind: RaceKind): ElectionRules {
  return {
    majority: MAJORITY_STATES.has(state),
    // Alaska uses RCV for all general elections; Maine for federal ones.
    rcv: state === 'AK' || (state === 'ME' && kind !== 'governor'),
  }
}
