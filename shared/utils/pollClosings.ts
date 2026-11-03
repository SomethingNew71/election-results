/**
 * When polls close on 3 November 2026 (UTC), from published state poll-closing
 * schedules. `first` and `last` differ where a state spans time zones or lets
 * some areas close later. civicAPI's `polls_close` field is NOT used: on
 * 2026-11-03 it was wrong for at least DE, CO, NV, WA and HI.
 */
export const POLL_CLOSINGS: Record<string, { first: string; last: string }> = {
  AK: { first: '2026-11-04T05:00:00Z', last: '2026-11-04T06:00:00Z' },
  AL: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  AR: { first: '2026-11-04T01:30:00Z', last: '2026-11-04T01:30:00Z' },
  AZ: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  CA: { first: '2026-11-04T04:00:00Z', last: '2026-11-04T04:00:00Z' },
  CO: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  CT: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  DC: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  DE: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  FL: { first: '2026-11-04T00:00:00Z', last: '2026-11-04T01:00:00Z' },
  GA: { first: '2026-11-04T00:00:00Z', last: '2026-11-04T00:00:00Z' },
  HI: { first: '2026-11-04T05:00:00Z', last: '2026-11-04T05:00:00Z' },
  IA: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  ID: { first: '2026-11-04T03:00:00Z', last: '2026-11-04T04:00:00Z' },
  IL: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  IN: { first: '2026-11-03T23:00:00Z', last: '2026-11-04T00:00:00Z' },
  KS: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T02:00:00Z' },
  KY: { first: '2026-11-03T23:00:00Z', last: '2026-11-04T00:00:00Z' },
  LA: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  MA: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  MD: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  ME: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  MI: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T02:00:00Z' },
  MN: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  MO: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  MS: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  MT: { first: '2026-11-04T03:00:00Z', last: '2026-11-04T03:00:00Z' },
  NC: { first: '2026-11-04T00:30:00Z', last: '2026-11-04T00:30:00Z' },
  ND: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T03:00:00Z' },
  NE: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T03:00:00Z' },
  NH: { first: '2026-11-04T00:00:00Z', last: '2026-11-04T01:00:00Z' },
  NJ: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  NM: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  NV: { first: '2026-11-04T03:00:00Z', last: '2026-11-04T03:00:00Z' },
  NY: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  OH: { first: '2026-11-04T00:30:00Z', last: '2026-11-04T00:30:00Z' },
  OK: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  OR: { first: '2026-11-04T03:00:00Z', last: '2026-11-04T04:00:00Z' },
  PA: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  RI: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  SC: { first: '2026-11-04T00:00:00Z', last: '2026-11-04T00:00:00Z' },
  SD: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T02:00:00Z' },
  TN: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T01:00:00Z' },
  TX: { first: '2026-11-04T01:00:00Z', last: '2026-11-04T02:00:00Z' },
  UT: { first: '2026-11-04T03:00:00Z', last: '2026-11-04T03:00:00Z' },
  VA: { first: '2026-11-04T00:00:00Z', last: '2026-11-04T00:00:00Z' },
  VT: { first: '2026-11-04T00:00:00Z', last: '2026-11-04T00:00:00Z' },
  WA: { first: '2026-11-04T04:00:00Z', last: '2026-11-04T04:00:00Z' },
  WI: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
  WV: { first: '2026-11-04T00:30:00Z', last: '2026-11-04T00:30:00Z' },
  WY: { first: '2026-11-04T02:00:00Z', last: '2026-11-04T02:00:00Z' },
}

export interface ClosingGroup {
  at: string
  /** States whose first polls close at this time. */
  first: string[]
  /** States whose last polls close at this time (when later than their first). */
  last: string[]
}

/** Upcoming closing times after `now`, grouped by time. */
export function upcomingClosings(now: number, limit = 3): ClosingGroup[] {
  const groups = new Map<string, ClosingGroup>()
  const group = (at: string) => {
    if (!groups.has(at)) groups.set(at, { at, first: [], last: [] })
    return groups.get(at)!
  }
  for (const [state, { first, last }] of Object.entries(POLL_CLOSINGS)) {
    if (Date.parse(first) > now) group(first).first.push(state)
    if (last !== first && Date.parse(last) > now) group(last).last.push(state)
  }
  return [...groups.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit)
}

/** True once the first polls in a state have closed. */
export function pollsHaveClosed(state: string, now: number): boolean {
  const t = POLL_CLOSINGS[state]
  return !t || Date.parse(t.first) <= now
}
