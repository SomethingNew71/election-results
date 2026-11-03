/**
 * One colour per party on every map, bar and dot. civicAPI assigns colours per
 * candidate (a second Republican can be yellow), so its colours are not used.
 */
export const PARTY_COLORS: Record<string, string> = {
  Democratic: '#4874a3',
  Republican: '#c6606b',
  Independent: '#7f8291',
  Libertarian: '#c9b52a',
  Green: '#3f9a3a',
}

export const NEUTRAL_COLOR = '#8a8a8a'

export function partyColor(party: string): string {
  return PARTY_COLORS[party] ?? NEUTRAL_COLOR
}

/** Fixed sides for the seat bar so parties never swap places as counts change. */
export const LEFT_PARTY = 'Democratic'
export const RIGHT_PARTY = 'Republican'
