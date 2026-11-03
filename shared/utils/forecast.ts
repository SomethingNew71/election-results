import { NEUTRAL_COLOR, partyColor } from './parties'

/**
 * civicAPI's rating scale, from most Democratic to most Republican. Only
 * "Tilt I" has been seen for independents; other I ratings sort with toss-ups.
 */
export const RATING_ORDER = [
  'Safe D',
  'Likely D',
  'Lean D',
  'Tilt D',
  'Tossup',
  'Tilt I',
  'Tilt R',
  'Lean R',
  'Likely R',
  'Safe R',
] as const

const PARTY_OF: Record<string, string> = { D: 'Democratic', R: 'Republican', I: 'Independent' }
const STRENGTH: Record<string, number> = { Safe: 0.85, Likely: 0.65, Lean: 0.45, Tilt: 0.28 }

/** "Lean D" → Democratic at 0.45; "Tossup" and unknown ratings → no party. */
export function ratingStyle(rating: string): { party: string | null; color: string; opacity: number } {
  const m = rating.match(/^(Safe|Likely|Lean|Tilt)\s+([DRI])$/)
  if (!m) return { party: null, color: NEUTRAL_COLOR, opacity: 0.45 }
  const party = PARTY_OF[m[2]!]!
  return { party, color: partyColor(party), opacity: STRENGTH[m[1]!]! }
}

export function ratingRank(rating: string): number {
  const i = (RATING_ORDER as readonly string[]).indexOf(rating)
  return i < 0 ? RATING_ORDER.indexOf('Tossup') : i
}

/** Seats in each chamber, for checking civicAPI's published totals. */
export const CHAMBER_SEATS = {
  senate: 100,
  house: 435,
  governor: 50,
} as const
