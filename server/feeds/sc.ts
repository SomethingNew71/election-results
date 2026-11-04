import type { FeedRace, RaceKind } from '#shared/types'
import { USER_AGENT } from '../utils/civic'
import type { FeedAdapter } from './http'

/**
 * South Carolina Election Commission results: Clarity ENR (election 127300,
 * 11/3/2026) at www.enr-scvotes.org. SC's contest names ("U.S.  Senate") and
 * candidate strings ("REP Alan Wilson / Mike Reichenbach") differ from the
 * shared Clarity adapter, so SC has its own. `current_ver.txt` is the version;
 * `json/en/summary.json` (about 140 KB) holds every contest. Units are counties.
 */
const BASE = 'https://www.enr-scvotes.org/SC/127300'
const TIMEOUT_MS = 8_000

export interface ScContest {
  C: string
  CH: string[]
  V: number[]
  PR?: number
  TP?: number
}

export function scKind(name: string): { kind: RaceKind; district: string | null } | null {
  const t = name.replace(/\s+/g, ' ').trim()
  if (/^U\.S\. Senate$/i.test(t)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(t)) return { kind: 'governor', district: null }
  const m = t.match(/^U\.S\. House of Representatives, District (\d+)$/i)
  return m ? { kind: 'house', district: `SC-${m[1]!.padStart(2, '0')}` } : null
}

/** "REP Alan Wilson / Mike Reichenbach" → "Alan Wilson". The running mate is dropped. */
export function scName(raw: string): string {
  return raw
    .replace(/^(?:[A-Z]{2,4})\s+/, '')
    .split(' / ')[0]!
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSc(contests: ScContest[]): FeedRace[] {
  const out: FeedRace[] = []
  for (const c of contests) {
    const kind = scKind(c.C ?? '')
    if (!kind) continue
    const candidates: { name: string; votes: number }[] = []
    let writeIn = 0
    let sawWriteIn = false
    c.CH.forEach((raw, i) => {
      const votes = Number(c.V[i]) || 0
      if (/^write-?\s?in$/i.test(raw.trim())) {
        writeIn += votes
        sawWriteIn = true
      } else candidates.push({ name: scName(raw), votes })
    })
    if (sawWriteIn) candidates.push({ name: 'Write-in', votes: writeIn })
    out.push({
      state: 'SC',
      ...kind,
      candidates,
      unitsReporting: c.PR ?? 0,
      unitsTotal: c.TP ?? 0,
      unitLabel: 'counties',
    })
  }
  return out
}

async function get(path: string, source: string): Promise<Response> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${source}: ${res.status} for ${path}`)
  return res
}

export const sc: FeedAdapter = {
  state: 'SC',
  source: 'South Carolina Election Commission',
  sourceUrl: `${BASE}/`,
  async load(prev) {
    const ver = (await (await get('current_ver.txt', this.source)).text()).trim()
    if (!/^\d+$/.test(ver)) throw new Error(`${this.source}: unexpected version "${ver.slice(0, 40)}"`)
    const version = Number(ver)
    if (prev !== null && version <= prev) return { version }
    const contests = (await (await get(`${ver}/json/en/summary.json`, this.source)).json()) as ScContest[]
    return { version, races: parseSc(contests) }
  },
}
