import type { RaceDetail } from '#shared/types'
import type { CivicRaceDetail } from '../../utils/civic'

export default defineEventHandler(async (event): Promise<RaceDetail | Response> => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid race id' })
  }
  const forwarded = await viaSnapshot(event)
  if (forwarded) return forwarded

  // Only proxy races on today's ballot, so arbitrary ids cannot fill the cache.
  // In dev, past races (for example 5861, the finished 2025 VA governor race) are allowed for testing.
  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p)
  const [{ races }, feeds] = await Promise.all([trackedRaces(waitUntil), stateFeedRaces(waitUntil)])
  const tracked = races.find((r) => r.id === id)
  if (!tracked && !import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Race not tracked' })

  const { data: d, fetchedAt, stale } = await civicGet<CivicRaceDetail>(`/race/${id}`, waitUntil)
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

  const feed = merged ? feeds.get(feedKey(merged))?.race : undefined
  const civicRegions = toRegions(d)
  // State feeds name counties without FIPS; borrow civicAPI's by name for the 2024 baseline.
  // Some feeds give names only (Clarity), others FIPS only (Tally); fill in the other from civicAPI.
  const fipsByName = new Map(civicRegions.filter((r) => r.fips).map((r) => [countyKey(r.name), r.fips]))
  const nameByFips = new Map(civicRegions.filter((r) => r.fips).map((r) => [r.fips, r.name]))
  const stateRegions =
    merged && feed
      ? feedRegions(merged, feed)?.map((r) => ({
          ...r,
          fips: r.fips ?? fipsByName.get(countyKey(r.name)) ?? warnUnmatched(merged.state, r.name),
          name: r.fips ? (nameByFips.get(r.fips) ?? r.name) : r.name,
        }))
      : null

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
    regions: stateRegions ?? civicRegions,
    regionSource: stateRegions ? 'state' : 'civicapi',
    projectionRegions: stateRegions ? civicRegions : null,
  }
})

const warned = new Set<string>()
/** A state county name civicAPI does not use: the map still matches by name, but the 2024 baseline skips it. */
function warnUnmatched(state: string, name: string): null {
  if (!/^\d{5}$/.test(name) && !warned.has(`${state}|${name}`)) {
    warned.add(`${state}|${name}`)
    console.warn(`State county "${name}" (${state}) has no civicAPI FIPS match`)
  }
  return null
}

function countyKey(name: string): string {
  return name.toLowerCase().replace(/\bst\.?\s/g, 'saint ').replace(/\bcounty\b/g, '').replace(/[^a-z]/g, '')
}
