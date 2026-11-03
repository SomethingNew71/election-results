import type { ForecastChamber, ForecastData, RaceKind } from '#shared/types'
import { countParties, GOVERNOR_NOT_UP, SENATE_NOT_UP } from '#shared/utils/officeholders'
import { parseForecast, type CivicForecast } from '../utils/forecast'

/** `holdovers` are the seats not up, by party (shared/utils/officeholders.ts). */
const CHAMBERS: { kind: RaceKind; threshold: number; holdovers: Record<string, number> }[] = [
  { kind: 'senate', threshold: 51, holdovers: countParties(SENATE_NOT_UP) },
  { kind: 'house', threshold: 218, holdovers: {} },
  // civicAPI publishes no threshold for governors; a majority of 50 states is 26.
  { kind: 'governor', threshold: 26, holdovers: countParties(GOVERNOR_NOT_UP) },
]
/** Links to race pages are optional; the forecast does not wait long for the race list. */
const LINK_BUDGET_MS = 300

/** civicAPI's 2026 forecast for /forecast. A chamber civicAPI does not answer for is left out, not fatal. */
export default defineEventHandler(async (event): Promise<ForecastData | Response> => {
  const forwarded = await viaSnapshot(event)
  if (forwarded) return forwarded

  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p)
  const linksP = trackedRaces(waitUntil).then(
    (t) => t.races,
    () => [],
  )
  const [tracked, settled] = await Promise.all([
    Promise.race([linksP, new Promise<[]>((resolve) => setTimeout(() => resolve([]), LINK_BUDGET_MS))]),
    Promise.allSettled(CHAMBERS.map((c) => civicGet<CivicForecast>(`/forecast/${c.kind}/2026/civicapi`, waitUntil))),
  ])

  // Link a forecast race to our page only when the match is unambiguous (two Senate races in one state are not).
  const ids = new Map<string, number[]>()
  for (const r of tracked) {
    const key = `${r.kind}|${r.kind === 'house' ? r.district : r.state}`
    ids.set(key, [...(ids.get(key) ?? []), r.id])
  }

  const chambers: ForecastChamber[] = []
  const missing: RaceKind[] = []
  let oldest = Infinity
  let stale = false
  CHAMBERS.forEach((c, i) => {
    const s = settled[i]!
    if (s.status === 'rejected' || !s.value.data || typeof s.value.data !== 'object') {
      missing.push(c.kind)
      return
    }
    chambers.push(parseForecast(c.kind, c.threshold, s.value.data, ids, c.holdovers))
    oldest = Math.min(oldest, s.value.fetchedAt)
    stale ||= s.value.stale
  })
  if (!chambers.length) throw createError({ statusCode: 502, statusMessage: 'civicAPI forecast is not responding' })

  setResponseHeader(event, 'cache-control', 'public, max-age=60')
  return { chambers, missing, dataAsOf: new Date(oldest).toISOString(), stale }
})
