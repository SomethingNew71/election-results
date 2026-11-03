import type { FeedRace, RaceKind, RaceSummary } from '#shared/types'

/**
 * Official state results published on Clarity ENR (Scytl) for the 2026
 * general. Checked 2026-11-03: only Colorado and Iowa publish statewide
 * 2026 general results there. Clarity's CloudFront blocks curl's default
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

export function parseClarity(state: string, contests: ClarityContest[]): FeedRace[] {
  const out: FeedRace[] = []
  for (const c of contests) {
    const kind = contestKind(state, c.C)
    if (!kind) continue
    out.push({
      state,
      ...kind,
      candidates: c.CH.map((name, i) => ({ name, votes: Number(c.V[i]) || 0 })),
      unitsReporting: c.PR ?? 0,
      unitsTotal: c.TP ?? 0,
    })
  }
  return out
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

type FeedMap = Map<string, { race: FeedRace; meta: FeedMeta }>
type Feed = (typeof CLARITY_FEEDS)[number]

/** A request waits at most this long for state feeds, then uses the last good copy. */
const BUDGET_MS = 1_500
/** After a failure, a state's feed is not retried for this long. */
const FAILURE_BACKOFF_MS = 60_000
const TIMEOUT_MS = 8_000

/**
 * Latest parsed feed per state. Only the small parsed races are kept, and a
 * version lower than one already applied is ignored, so counts never move
 * backwards between polls.
 */
const latest = new Map<string, { version: number; races: FeedRace[]; meta: FeedMeta }>()
const failedAt = new Map<string, number>()
const refreshing = new Map<string, Promise<void>>()

function refreshFeed(f: Feed): Promise<void> {
  if (Date.now() - (failedAt.get(f.state) ?? 0) < FAILURE_BACKOFF_MS) return Promise.resolve()
  const pending = refreshing.get(f.state)
  if (pending) return pending

  const base = `${CLARITY}/${f.state}/${f.eid}`
  const run = (async () => {
    const ver = await cachedGet<string>(`${base}/current_ver.txt`, f.source, async (res) => (await res.text()).trim())
    if (!/^\d+$/.test(ver.data)) throw new Error(`${f.source}: unexpected version "${ver.data.slice(0, 40)}"`)
    const version = Number(ver.data)
    const prev = latest.get(f.state)
    if (prev && version <= prev.version) {
      prev.meta.checkedAt = new Date(ver.fetchedAt).toISOString()
      return
    }

    const res = await fetch(`${base}/${version}/json/en/summary.json`, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`${f.source}: summary ${res.status}`)
    const races = parseClarity(f.state, (await res.json()) as ClarityContest[])
    latest.set(f.state, {
      version,
      races,
      meta: {
        source: f.source,
        sourceUrl: `${base}/`,
        fetchedAt: new Date().toISOString(),
        checkedAt: new Date(ver.fetchedAt).toISOString(),
        version: String(version),
      },
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
  const refresh = Promise.allSettled(CLARITY_FEEDS.map(refreshFeed))
  if (waitUntil && CLARITY_FEEDS.every((f) => latest.has(f.state))) waitUntil(refresh)
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
