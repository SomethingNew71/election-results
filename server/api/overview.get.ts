import type { ChamberTotals, Overview } from '#shared/types'

const CHAMBERS: ChamberTotals[] = [
  { kind: 'senate', holdovers: countParties(SENATE_NOT_UP), totalSeats: 100 },
  { kind: 'house', holdovers: {}, totalSeats: 435 },
  { kind: 'governor', holdovers: countParties(GOVERNOR_NOT_UP), totalSeats: 50 },
]

export default defineEventHandler(async (event): Promise<Overview> => {
  const tracked = await trackedRaces()
  const { fetchedAt, stale } = tracked
  const races = await applyStateFeeds(tracked.races)
  setResponseHeader(event, 'cache-control', 'public, max-age=15')
  return { dataAsOf: new Date(fetchedAt).toISOString(), stale, races, chambers: CHAMBERS }
})
