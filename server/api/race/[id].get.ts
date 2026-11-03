import type { RaceDetail } from '#shared/types'
import type { CivicRaceDetail } from '../../utils/civic'

export default defineEventHandler(async (event): Promise<RaceDetail> => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid race id' })
  }

  // Only proxy races on today's ballot, so arbitrary ids cannot fill the cache.
  // In dev, past races (for example 5861, the finished 2025 VA governor race) are allowed for testing.
  const [{ races }, feeds] = await Promise.all([trackedRaces(), stateFeedRaces()])
  const tracked = races.find((r) => r.id === id)
  if (!tracked && !import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Race not tracked' })

  const { data: d, fetchedAt, stale } = await civicGet<CivicRaceDetail>(`/race/${id}`)
  const kind = kindOf(d.election_type)
  if (!kind) throw createError({ statusCode: 404, statusMessage: 'Race not tracked' })
  const base = {
    ...(tracked ?? { id, kind, state: d.province ?? 'US', district: d.district }),
    name: d.election_name,
    pct: d.percent_reporting ?? 0,
    candidates: d.candidates.map(toCandidate),
    crossCheck: undefined,
  }
  // Merge alongside every tracked race so the duplicate-key guard sees the whole ballot.
  const merged = applyFeeds(tracked ? races.map((r) => (r.id === id ? base : r)) : [base], feeds).find((r) => r.id === id)

  setResponseHeader(event, 'cache-control', 'public, max-age=15')
  return {
    ...merged!,
    pollsClose: d.polls_close,
    lastUpdated: d.last_updated,
    registeredVoters: d.registered_voters,
    testData: Boolean(d.test_data),
    disputed: Boolean(d.is_disputed),
    dataAsOf: new Date(fetchedAt).toISOString(),
    stale,
    regions: toRegions(d),
  }
})
