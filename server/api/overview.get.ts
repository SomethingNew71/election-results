import type { ChamberTotals, Overview } from '#shared/types'

const CHAMBERS: ChamberTotals[] = [
  { kind: 'senate', holdovers: countParties(SENATE_NOT_UP), totalSeats: 100 },
  { kind: 'house', holdovers: {}, totalSeats: 435 },
  { kind: 'governor', holdovers: countParties(GOVERNOR_NOT_UP), totalSeats: 50 },
]

/** The last overview body, reused until civicAPI data or any feed check changes. */
let memo: { key: string; body: string } | null = null

export default defineEventHandler(async (event): Promise<Overview | Response | string> => {
  const forwarded = await viaSnapshot(event)
  if (forwarded) return forwarded
  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p)
  const [tracked, feeds] = await Promise.all([trackedRaces(waitUntil), stateFeedRaces(waitUntil)])
  setResponseHeader(event, 'cache-control', 'public, max-age=15')
  setResponseHeader(event, 'content-type', 'application/json')
  const key = [tracked.fetchedAt, tracked.stale, ...[...new Set([...feeds.values()].map((f) => f.meta))].map((m) => `${m.version}@${m.checkedAt}`)].join('|')
  if (memo?.key === key) return memo.body
  const races = applyFeeds(tracked.races, feeds)
  const overview: Overview = { dataAsOf: new Date(tracked.fetchedAt).toISOString(), stale: tracked.stale, races, chambers: CHAMBERS }
  memo = { key, body: JSON.stringify(overview) }
  return memo.body
})
