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
  version: string | null
}

export function feedKey(r: { state: string; kind: RaceKind; district: string | null }): string {
  return `${r.state}|${r.kind}|${r.district ?? ''}`
}

/** All feed races keyed by state, kind and district. A failing feed is skipped. */
export async function stateFeedRaces(): Promise<Map<string, { race: FeedRace; meta: FeedMeta }>> {
  const out = new Map<string, { race: FeedRace; meta: FeedMeta }>()
  const results = await Promise.allSettled(
    CLARITY_FEEDS.map(async (f) => {
      const base = `${CLARITY}/${f.state}/${f.eid}`
      const ver = await cachedGet<string>(`${base}/current_ver.txt`, f.source, async (res) => (await res.text()).trim())
      if (!/^\d+$/.test(ver.data)) throw new Error(`${f.source}: unexpected version "${ver.data.slice(0, 40)}"`)
      const summary = await cachedGet<ClarityContest[]>(`${base}/${ver.data}/json/en/summary.json`, f.source)
      const meta: FeedMeta = {
        source: f.source,
        sourceUrl: `${base}/`,
        fetchedAt: new Date(summary.fetchedAt).toISOString(),
        version: ver.data,
      }
      return parseClarity(f.state, summary.data).map((race) => ({ race, meta }))
    }),
  )
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('State feed failed', r.reason)
      continue
    }
    for (const item of r.value) out.set(feedKey(item.race), item)
  }
  return out
}

export async function applyStateFeeds(races: RaceSummary[]): Promise<RaceSummary[]> {
  const feeds = await stateFeedRaces()
  if (!feeds.size) return races
  return races.map((race) => {
    const hit = feeds.get(feedKey(race))
    return hit ? mergeFeed(race, hit.race, hit.meta) : race
  })
}
