import type { RaceKind } from '../types'
import { GOVERNOR_HOLDERS, HOUSE_HOLDERS, SENATE_HOLDERS } from './seatHolders'

const LETTER_PARTY: Record<string, string> = {
  D: 'Democratic',
  R: 'Republican',
  I: 'Independent',
}

/** civicAPI's names for no party. */
const INDEPENDENT = new Set(['Independent', 'Independent/Unenrolled', 'Unenrolled', 'No Party Affiliation', 'No Political Party'])
/** These say nothing about a party, so no comparison can be made. */
const UNKNOWN = new Set(['Nonpartisan', 'Unaffiliated', 'Other Party'])

export interface Flip {
  from: string
  to: string
}

export interface FlipRace {
  kind: RaceKind
  state: string
  district: string | null
  delegate?: boolean
  candidates: { party: string; winner: boolean }[]
}

function holderLetter(race: FlipRace): string | undefined {
  if (race.delegate) return undefined
  if (race.kind === 'senate') return SENATE_HOLDERS[race.state]
  if (race.kind === 'governor') return GOVERNOR_HOLDERS[race.state]
  const number = race.district?.split('-')[1]
  if (!number) return undefined
  return HOUSE_HOLDERS[race.state]?.[number === 'AL' ? 0 : Number(number) - 1]
}

/** The change of party when civicAPI has called a winner from another party; otherwise null. */
export function flipOf(race: FlipRace): Flip | null {
  const winners = race.candidates.filter((c) => c.winner)
  if (winners.length !== 1 || UNKNOWN.has(winners[0]!.party)) return null
  const letter = holderLetter(race)
  if (!letter) return null
  const from = LETTER_PARTY[letter]!
  const to = INDEPENDENT.has(winners[0]!.party) ? 'Independent' : winners[0]!.party
  return from === to ? null : { from, to }
}
