import type { Candidate, RaceKind, RaceSummary, RegionResult } from '#shared/types'
import raceSeed from '../data/race-seed.json'

const BASE = 'https://civicapi.org/api/v2'
export const USER_AGENT = 'election-results-worker (+https://github.com/SomethingNew71/election-results)'

/** Fresh window per isolate. civicAPI itself caches for 15 s. */
const TTL_MS = 20_000
/** Past this age, stale data is an error instead of a fallback. */
const MAX_STALE_MS = 10 * 60_000
/** The race list is the page's skeleton: a labelled old copy beats an error page. */
const LIST_MAX_STALE_MS = 24 * 3_600_000
const maxStale = (key: string) => (/\/race\/search\?/.test(key) ? LIST_MAX_STALE_MS : MAX_STALE_MS)
const TIMEOUT_MS = 8_000
/** One Durable Object serves every reader, so this holds all ~510 race details at once. */
const MAX_ENTRIES = 2_000
/** Never evicted: losing these makes the overview cold and loses its stale fallback. */
const PINNED = /\/race\/search\?|current_ver\.txt$/

export interface Fetched<T> {
  data: T
  /** When this copy came from civicAPI (ms epoch). */
  fetchedAt: number
  /** True when a refresh failed and an older copy is being served. */
  stale: boolean
}

const cache = new Map<string, { fetchedAt: number; data: unknown }>()
const inflight = new Map<string, Promise<Fetched<unknown>>>()

function remember(path: string, data: unknown, fetchedAt: number) {
  cache.delete(path)
  cache.set(path, { fetchedAt, data })
  // Map keeps insertion order, so the first key is the least recently written.
  for (const key of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break
    if (!PINNED.test(key)) cache.delete(key)
  }
}

export function civicGet<T>(path: string, waitUntil?: WaitUntil): Promise<Fetched<T>> {
  return cachedGet<T>(`${BASE}${path}`, 'civicAPI', undefined, undefined, waitUntil)
}

export type WaitUntil = (p: Promise<unknown>) => void

/**
 * Past TTL_MS and up to this age, the cached copy is served at once while a
 * refresh runs in the background. civicAPI misses take about 2 s. The copy's
 * real age reaches the page through `dataAsOf`.
 */
const SWR_MS = 90_000
/**
 * Past SWR_MS and up to MAX_STALE_MS, a request waits this long for the refresh,
 * then gets the cached copy marked stale. It must stay under snapshot.ts's
 * FORWARD_TIMEOUT_MS: an isolate that gives up on the object has no copy to serve.
 */
const REFRESH_WAIT_MS = 2_000

/**
 * GET a URL with the per-isolate cache, request coalescing, a timeout,
 * stale-while-revalidate and a bounded stale fallback. `parse` turns the body
 * into data (JSON by default). Pass `waitUntil` so background refreshes
 * outlive the response.
 */
export async function cachedGet<T>(
  url: string,
  sourceName: string,
  parse: (res: Response) => Promise<unknown> = (res) => res.json(),
  /** Cache under a stable key when the URL changes per version. */
  key = url,
  waitUntil?: WaitUntil,
): Promise<Fetched<T>> {
  const hit = cache.get(key)
  const age = hit ? Date.now() - hit.fetchedAt : Infinity
  if (hit && age < TTL_MS) {
    return { data: hit.data as T, fetchedAt: hit.fetchedAt, stale: false }
  }

  const pending = inflight.get(key)
  const request = pending ?? (async (): Promise<Fetched<unknown>> => {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 404) throw createError({ statusCode: 404, statusMessage: `Not found at ${sourceName}` })
      if (!res.ok) throw createError({ statusCode: 502, statusMessage: `${sourceName} ${res.status}` })
      const data = await parse(res)
      const fetchedAt = Date.now()
      remember(key, data, fetchedAt)
      return { data, fetchedAt, stale: false }
    } catch (err) {
      const isNotFound = (err as { statusCode?: number }).statusCode === 404
      if (hit && !isNotFound && Date.now() - hit.fetchedAt < maxStale(key)) {
        console.warn(`${sourceName} refresh failed for ${url}; serving copy from ${new Date(hit.fetchedAt).toISOString()}`, err)
        return { data: hit.data, fetchedAt: hit.fetchedAt, stale: true }
      }
      if (isNotFound) throw err
      throw createError({ statusCode: 502, statusMessage: `${sourceName} is not responding` })
    } finally {
      inflight.delete(key)
    }
  })()
  if (!pending) inflight.set(key, request)
  if (!hit || age >= maxStale(key)) return request as Promise<Fetched<T>>

  // A copy exists, so a slow or failing civicAPI never costs the reader an error.
  const background = request.catch(() => {})
  waitUntil?.(background)
  if (age < SWR_MS) return { data: hit.data as T, fetchedAt: hit.fetchedAt, stale: false }
  const copy: Fetched<T> = { data: hit.data as T, fetchedAt: hit.fetchedAt, stale: true }
  return Promise.race([
    request as Promise<Fetched<T>>,
    new Promise<Fetched<T>>((resolve) => setTimeout(() => resolve(copy), REFRESH_WAIT_MS)),
  ])
}

export interface CivicCandidate {
  name: string
  party: string | null
  color: string | null
  votes: number | string
  seats?: number
  winner?: boolean
  incumbent?: boolean
}

export interface CivicRace {
  id: number
  type: string
  province: string | null
  district: string | null
  election_name: string
  election_type: string
  percent_reporting: number
  candidates: CivicCandidate[]
}

export interface CivicRaceDetail {
  election_name: string
  election_type: string
  election_scope: string
  province: string | null
  district: string | null
  polls_close: string | null
  last_updated: string | null
  registered_voters: number | null
  percent_reporting: number
  test_data: boolean
  is_disputed: boolean
  candidates: CivicCandidate[]
  region_results: Record<
    string,
    { name: string; type: string; fips?: string; percent_reporting: number; candidates: CivicCandidate[] }
  > | null
}

export function parseVotes(v: number | string): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) console.warn(`Unparseable vote count from civicAPI: ${v}`)
  return Number.isFinite(n) ? n : 0
}

export function toCandidate(c: CivicCandidate): Candidate {
  const party = c.party || 'Unaffiliated'
  return {
    name: c.name,
    party,
    color: partyColor(party),
    votes: parseVotes(c.votes),
    winner: Boolean(c.winner),
    incumbent: c.incumbent,
  }
}

export function kindOf(type: string): RaceKind | null {
  if (type === 'US Senate') return 'senate'
  if (type === 'Governor') return 'governor'
  // DC and the territories elect non-voting delegates; they list with the House but never count toward its 435 seats.
  if (type === 'House of Representatives' || type === 'Delegate') return 'house'
  return null
}

export function toSummary(r: CivicRace, kind: RaceKind): RaceSummary {
  return {
    id: r.id,
    kind,
    name: r.election_name,
    state: r.province ?? 'US',
    district: r.district,
    pct: r.percent_reporting ?? 0,
    candidates: r.candidates.map(toCandidate),
    ...(r.type === 'Delegate' ? { delegate: true } : {}),
  }
}

/**
 * Some races list overlapping region types (Alaska: boroughs AND house
 * districts AND a statewide row; Maine: counties AND townships). Keep one
 * non-overlapping type so votes are not counted twice.
 */
const REGION_TYPE_PREFERENCE = ['County', 'Parish', 'Borough', 'Township', 'House District']

export function toRegions(detail: CivicRaceDetail): RegionResult[] {
  const entries = Object.entries(detail.region_results ?? {})
  const types = new Set(entries.map(([, r]) => r.type))
  const keep = REGION_TYPE_PREFERENCE.find((t) => types.has(t))
  return entries
    .filter(([, r]) => (keep ? r.type === keep : r.type !== 'State'))
    .map(([key, r]) => ({
      key,
      name: r.name,
      fips: r.fips ?? null,
      pct: r.percent_reporting ?? 0,
      candidates: r.candidates.map(toCandidate),
    }))
}

const ELECTION_DATE = '2026-11-03'

export interface TrackedRaces {
  races: RaceSummary[]
  fetchedAt: number
  stale: boolean
}

const searchUrl = (scope: string) =>
  `${BASE}/race/search?country=US&startDate=${ELECTION_DATE}&endDate=${ELECTION_DATE}&election_type=${scope}&limit=5000`

// Every isolate and object starts with the bundled race list (scripts/build-race-seed.ts),
// so a deploy during a civicAPI outage shows the ballot, marked stale, with the state feeds' counts.
for (const scope of ['General', 'Statewide'] as const) {
  remember(searchUrl(scope), { races: raceSeed[scope] }, Date.parse(raceSeed.capturedAt))
}

/** Senate, House and Governor races on today's ballot, from two search calls. */
export async function trackedRaces(waitUntil?: WaitUntil): Promise<TrackedRaces> {
  const scopes = ['General', 'Statewide'] as const
  const results = await Promise.all(
    scopes.map((scope) =>
      cachedGet<{ races: CivicRace[] }>(searchUrl(scope), 'civicAPI', undefined, undefined, waitUntil),
    ),
  )
  const races: RaceSummary[] = []
  const seen = new Set<number>()
  for (const r of results.flatMap((res) => res.data.races)) {
    const kind = kindOf(r.type)
    if (!kind || seen.has(r.id) || r.province === 'US') continue
    seen.add(r.id)
    races.push(toSummary(r, kind))
  }
  return {
    races,
    fetchedAt: Math.min(...results.map((r) => r.fetchedAt)),
    stale: results.some((r) => r.stale),
  }
}
