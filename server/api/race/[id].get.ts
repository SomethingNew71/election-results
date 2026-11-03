import type { RaceDetail } from '#shared/types'
import type { CivicRaceDetail } from '../../utils/civic'

export default defineEventHandler(async (event): Promise<RaceDetail> => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid race id' })
  }

  // Only proxy races on today's ballot, so arbitrary ids cannot fill the cache.
  // In dev, past races (for example 5861, the finished 2025 VA governor race) are allowed for testing.
  const { races } = await trackedRaces()
  const tracked = races.find((r) => r.id === id)
  if (!tracked && !import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Race not tracked' })

  const { data: d, fetchedAt, stale } = await civicGet<CivicRaceDetail>(`/race/${id}`)
  const kind = kindOf(d.election_type)
  if (!kind) throw createError({ statusCode: 404, statusMessage: 'Race not tracked' })
  const summary = tracked ?? { id, kind, name: d.election_name, state: d.province ?? 'US', district: d.district, pct: 0, candidates: [] }

  const [merged] = await applyStateFeeds([
    {
      ...summary,
      name: d.election_name,
      pct: d.percent_reporting ?? 0,
      pctEstimated: false,
      candidates: d.candidates.map(toCandidate),
      crossCheck: undefined,
    },
  ])

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
