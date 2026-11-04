import type { RaceKind } from '../types'
import { rulesFor } from './rules'
import { GOVERNOR_HOLDERS, HOUSE_HOLDERS, SENATE_HOLDERS } from './seatHolders'

const LETTER_PARTY: Record<string, string> = {
  D: 'Democratic',
  R: 'Republican',
  I: 'Independent',
}

/** civicAPI's names for no party. */
const INDEPENDENT = new Set(['Independent', 'Independent/Unenrolled', 'Unenrolled', 'No Party Affiliation', 'No Party Preference', 'No Political Party'])

/** Deny by default: civicAPI's party labels are live values, and a variant must never read as a change of party. */
function partyOf(label: string): string | null {
  if (label === 'Democratic' || label === 'Republican') return label
  return INDEPENDENT.has(label) ? 'Independent' : null
}

export interface Flip {
  from: string
  to: string
}

export interface FlipRace {
  kind: RaceKind
  state: string
  district: string | null
  delegate?: boolean
  candidates: { party: string; votes: number; winner: boolean }[]
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
  if (winners.length !== 1) return null
  const winner = winners[0]!
  const to = partyOf(winner.party)
  const letter = holderLetter(race)
  if (!to || !letter) return null
  // A flag below 50% in a runoff or RCV race is not the final result.
  const rules = rulesFor(race.state, race.kind)
  const total = race.candidates.reduce((sum, c) => sum + c.votes, 0)
  if ((rules.majority || rules.rcv) && winner.votes * 2 <= total) return null
  const from = LETTER_PARTY[letter]!
  return from === to ? null : { from, to }
}
