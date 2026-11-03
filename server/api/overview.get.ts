import type { ChamberTotals, Overview } from '#shared/types'

const CHAMBERS: ChamberTotals[] = [
  { kind: 'senate', holdovers: countParties(SENATE_NOT_UP), totalSeats: 100 },
  { kind: 'house', holdovers: {}, totalSeats: 435 },
  { kind: 'governor', holdovers: countParties(GOVERNOR_NOT_UP), totalSeats: 50 },
]

export default defineEventHandler(async (event): Promise<Overview | Response> => {
  const forwarded = await viaSnapshot(event)
  if (forwarded) return forwarded
  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p)
  const [tracked, feeds] = await Promise.all([trackedRaces(waitUntil), stateFeedRaces(waitUntil)])
  const races = applyFeeds(tracked.races, feeds)
  setResponseHeader(event, 'cache-control', 'public, max-age=15')
  return { dataAsOf: new Date(tracked.fetchedAt).toISOString(), stale: tracked.stale, races, chambers: CHAMBERS }
})
