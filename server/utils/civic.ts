import type { Candidate, RaceKind, RaceSummary, RegionResult } from '#shared/types'

const BASE = 'https://civicapi.org/api/v2'
const USER_AGENT = 'election-results-worker (+https://civicapi.org attribution)'

/** Upstream responses are cached per isolate. civicAPI itself caches for 15 s. */
const TTL_MS = 20_000
const cache = new Map<string, { at: number; data: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

export async function civicGet<T>(path: string, ttlMs = TTL_MS): Promise<T> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T

  const pending = inflight.get(path)
  if (pending) return pending as Promise<T>

  const request = (async () => {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      })
      if (!res.ok) throw createError({ statusCode: 502, statusMessage: `civicAPI ${res.status}` })
      const data = await res.json()
      cache.set(path, { at: Date.now(), data })
      return data
    } catch (err) {
      // Serve stale data rather than an error while upstream is struggling.
      if (hit) return hit.data
      throw err
    } finally {
      inflight.delete(path)
    }
  })()
  inflight.set(path, request)
  return request as Promise<T>
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
  candidates: CivicCandidate[]
  region_results: Record<
    string,
    { name: string; fips?: string; percent_reporting: number; candidates: CivicCandidate[] }
  > | null
}

const NEUTRAL = '#8a8a8a'

export function toCandidate(c: CivicCandidate): Candidate {
  return {
    name: c.name,
    party: c.party || 'Unaffiliated',
    color: c.color || NEUTRAL,
    votes: Number(c.votes) || 0,
    winner: Boolean(c.winner),
    incumbent: c.incumbent,
  }
}

export function kindOf(type: string): RaceKind | null {
  if (type === 'US Senate') return 'senate'
  if (type === 'Governor') return 'governor'
  if (type === 'House of Representatives') return 'house'
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
  }
}

export function toRegions(detail: CivicRaceDetail): RegionResult[] {
  return Object.entries(detail.region_results ?? {}).map(([key, r]) => ({
    key,
    name: r.name,
    fips: r.fips ?? null,
    pct: r.percent_reporting ?? 0,
    candidates: r.candidates.map(toCandidate),
  }))
}
