import type { FeedRace, FeedRegion, RaceKind, RaceSummary } from '#shared/types'
import type { FeedAdapter } from '../feeds/http'
import { delaware } from '../feeds/delaware'
import { ohio } from '../feeds/ohio'
import { arkansas, missouri } from '../feeds/tally'
import { virginia } from '../feeds/virginia'

/**
 * Official state results. Clarity ENR (Scytl) is read here; other vendors'
 * adapters are in server/feeds/. Checked 2026-11-03: only Colorado and Iowa
 * publish statewide 2026 general results on Clarity. Clarity's CloudFront blocks curl's default
 * User-Agent; our descriptive one (set in cachedGet) is accepted.
 */
const CLARITY_FEEDS = [
  { state: 'CO', eid: '127407', source: 'Colorado Secretary of State' },
  { state: 'IA', eid: '127077', source: 'Iowa Secretary of State' },
] as const

const CLARITY = 'https://results.enr.clarityelections.com'

interface ClarityContest {
  K: string
  C: string
  CH: string[]
  V: number[]
  PR: number
  TP: number
}

export function contestKind(state: string, name: string): { kind: RaceKind; district: string | null } | null {
  if (/^United States Senator/i.test(name)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(name)) return { kind: 'governor', district: null }
  const house = name.match(/(?:United States Representative|United States Congress)\b.*?District\s+(\d+)/i)
  if (house) return { kind: 'house', district: `${state}-${house[1]!.padStart(2, '0')}` }
  return null
}

/** One contest in Clarity's `json/details.json`: arrays are per county, in the same order. */
export interface ClarityDetail {
  K: string
  /** County names. */
  P: string[]
  /** Precincts fully reported, per county. */
  PX: number[]
  /** Precincts in total, per county. */
  PY: number[]
  /** Votes per county, per candidate in the summary's `CH` order. */
  V: number[][]
}

export function parseClarity(state: string, contests: ClarityContest[], details: ClarityDetail[] = []): FeedRace[] {
  const detailByKey = new Map(details.map((d) => [d.K, d]))
  const out: FeedRace[] = []
  for (const c of contests) {
    const kind = contestKind(state, c.C)
    if (!kind) continue
    const d = detailByKey.get(c.K)
    out.push({
      state,
      ...kind,
      candidates: c.CH.map((name, i) => ({ name, votes: Number(c.V[i]) || 0 })),
      unitsReporting: c.PR ?? 0,
      unitsTotal: c.TP ?? 0,
      unitLabel: 'counties',
      regions: d ? parseRegions(d, c.CH.length) : undefined,
    })
  }
  return out
}

function parseRegions(d: ClarityDetail, candidates: number): FeedRegion[] | undefined {
  // A shape change in the feed drops the county breakdown, not the race.
  if (!Array.isArray(d.P) || d.V?.length !== d.P.length) return undefined
  if (d.V.some((v) => !Array.isArray(v) || v.length !== candidates)) return undefined
  return d.P.map((name, i) => ({
    name,
    precinctsReporting: Number(d.PX?.[i]) || 0,
    precinctsTotal: Number(d.PY?.[i]) || 0,
    votes: d.V[i]!.map((n) => Number(n) || 0),
  }))
}

export interface FeedMeta {
  source: string
  sourceUrl: string
  fetchedAt: string
  checkedAt: string
  version: string | null
}

export function feedKey(r: { state: string; kind: RaceKind; district: string | null }): string {
  return `${r.state}|${r.kind}|${r.district ?? ''}`
}

export type FeedMap = Map<string, { race: FeedRace; meta: FeedMeta }>
function clarityAdapter(f: (typeof CLARITY_FEEDS)[number]): FeedAdapter {
  const base = `${CLARITY}/${f.state}/${f.eid}`
  return {
    state: f.state,
    source: f.source,
    sourceUrl: `${base}/`,
    async load(prev) {
      const ver = await cachedGet<string>(`${base}/current_ver.txt`, f.source, async (res) => (await res.text()).trim())
      if (!/^\d+$/.test(ver.data)) throw new Error(`${f.source}: unexpected version "${ver.data.slice(0, 40)}"`)
      const version = Number(ver.data)
      if (prev !== null && version <= prev) return { version }
      const get = (path: string) =>
        fetch(`${base}/${version}/${path}`, {
          headers: { accept: 'application/json', 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      const [res, detailRes] = await Promise.all([get('json/en/summary.json'), get('json/details.json').catch(() => null)])
      if (!res.ok) throw new Error(`${f.source}: summary ${res.status}`)
      // County detail is optional: without it the race still cross-checks.
      let details: ClarityDetail[] = []
      if (detailRes?.ok) {
        try {
          details = ((await detailRes.json()) as { Contests?: ClarityDetail[] }).Contests ?? []
        } catch (err) {
          console.warn(`${f.source}: county detail unreadable`, err)
        }
      }
      return { version, races: parseClarity(f.state, (await res.json()) as ClarityContest[], details) }
    },
  }
}

/**
 * Every official feed, one per state. Adding a state: write an adapter in
 * server/feeds/, add a parser test, and list it here.
 */
const ADAPTERS: FeedAdapter[] = [...CLARITY_FEEDS.map(clarityAdapter), ohio, arkansas, missouri, virginia, delaware]

/** A request waits at most this long for state feeds, then uses the last good copy. */
const BUDGET_MS = 1_500
/** After a failure, a state's feed is not retried for this long. */
const FAILURE_BACKOFF_MS = 60_000
/** Feeds are not asked more often than this. */
const MIN_INTERVAL_MS = 20_000
const TIMEOUT_MS = 8_000

/**
 * Latest parsed feed per state. Only the small parsed races are kept, and a
 * version not higher than one already applied is ignored, so counts never
 * move backwards between polls. Feeds without a version stamp use total votes.
 */
const latest = new Map<string, { version: number; races: FeedRace[]; meta: FeedMeta }>()
const failedAt = new Map<string, number>()
const attemptedAt = new Map<string, number>()
const refreshing = new Map<string, Promise<void>>()

function refreshFeed(f: FeedAdapter): Promise<void> {
  const now = Date.now()
  if (now - (failedAt.get(f.state) ?? 0) < FAILURE_BACKOFF_MS) return Promise.resolve()
  const pending = refreshing.get(f.state)
  if (pending) return pending
  if (latest.has(f.state) && now - (attemptedAt.get(f.state) ?? 0) < MIN_INTERVAL_MS) return Promise.resolve()
  attemptedAt.set(f.state, now)

  const run = (async () => {
    const prev = latest.get(f.state)
    const loaded = await f.load(prev?.version ?? null)
    const checkedAt = new Date().toISOString()
    if (prev && (!loaded.races || loaded.version <= prev.version)) {
      prev.meta.checkedAt = checkedAt
      return
    }
    if (!loaded.races) return
    latest.set(f.state, {
      version: loaded.version,
      races: loaded.races,
      meta: { source: f.source, sourceUrl: f.sourceUrl, fetchedAt: checkedAt, checkedAt, version: String(loaded.version) },
    })
  })()
    .catch((err) => {
      failedAt.set(f.state, Date.now())
      console.warn(`State feed ${f.state} failed; retrying after ${FAILURE_BACKOFF_MS / 1000}s`, err)
    })
    .finally(() => refreshing.delete(f.state))
  refreshing.set(f.state, run)
  return run
}

/**
 * Feed races keyed by state, kind and district. Once every state has a copy,
 * refreshes run in the background (`waitUntil`) and the request never waits.
 * Before that, it waits up to BUDGET_MS, so a slow or blocked feed never
 * holds up the page.
 */
export async function stateFeedRaces(waitUntil?: (p: Promise<unknown>) => void): Promise<FeedMap> {
  const refresh = Promise.allSettled(ADAPTERS.map(refreshFeed))
  // A state that has never loaded (failing or blocked) must not make every request wait.
  if (waitUntil && ADAPTERS.every((f) => latest.has(f.state) || failedAt.has(f.state))) waitUntil(refresh)
  else await Promise.race([refresh, new Promise((resolve) => setTimeout(resolve, BUDGET_MS))])
  const out: FeedMap = new Map()
  for (const { races, meta } of latest.values()) {
    for (const race of races) out.set(feedKey(race), { race, meta })
  }
  return out
}

export function applyFeeds(races: RaceSummary[], feeds: FeedMap): RaceSummary[] {
  if (!feeds.size) return races
  // Two civicAPI races with one key (a regular and a special Senate race) cannot be told apart.
  const keyCount = new Map<string, number>()
  for (const r of races) keyCount.set(feedKey(r), (keyCount.get(feedKey(r)) ?? 0) + 1)
  return races.map((race) => {
    const key = feedKey(race)
    const hit = feeds.get(key)
    return hit && keyCount.get(key) === 1 ? mergeFeed(race, hit.race, hit.meta) : race
  })
}
