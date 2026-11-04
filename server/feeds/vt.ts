import type { FeedRace } from '#shared/types'
import { getJson, countsFingerprint, type FeedAdapter } from './http'

/**
 * Vermont Secretary of State election night results (electionresults.vermont.gov,
 * an Angular app over static JSON on static.electionresults.vermont.gov).
 * Three requests per load, about 480 KB in all:
 *   1. `elections/<election guid>.json`: the index. It names the current data
 *      files; each file name ends in a 14-digit stamp (`...-f-20261103201109.json`)
 *      that changes on every publish, so the stamp is the version.
 *   2. the `federal` file (US House, 73 KB).
 *   3. the `stateWide` file (governor and the other statewide offices, 290 KB).
 * Both data files hold one entry per reporting town (split towns appear twice);
 * the statewide count is the sum of the town rows. Vermont has no US Senate
 * race in 2026. Votes for "OTHER WRITE-IN" and for named write-ins go to one
 * "Write-in" row. Town counts come from the index, not per contest.
 */
const BASE = 'https://static.electionresults.vermont.gov'
/** 2026 GENERAL ELECTION in `elections/elections.json`. */
const ELECTION_GUID = '68d61e96-1d28-4210-8c1d-8e90512ae105'

export interface VermontIndex {
  federal?: { isEnable?: boolean; path?: string }
  stateWide?: { isEnable?: boolean; path?: string }
  townsReporting?: string
}

interface VermontCandidate {
  cn: string
  vc: number
  isWriteIn?: boolean
}

export interface VermontFile {
  d?: {
    o?: {
      on: string
      cs?: { rc?: VermontCandidate[]; wc?: VermontCandidate[] }[]
    }[]
  }[]
}

const OFFICES: Record<string, { kind: 'governor' | 'house'; district: string | null }> = {
  GOVERNOR: { kind: 'governor', district: null },
  'REPRESENTATIVE TO CONGRESS': { kind: 'house', district: 'VT-AL' },
}

export function parseVermont(file: VermontFile, towns: { reporting: number; total: number }): FeedRace[] {
  const out: FeedRace[] = []
  for (const party of file.d ?? []) {
    for (const office of party.o ?? []) {
      const spec = OFFICES[office.on?.trim().toUpperCase()]
      if (!spec) continue
      const named = new Map<string, number>()
      let writeIns = 0
      let sawWriteIn = false
      for (const town of office.cs ?? []) {
        for (const c of town.rc ?? []) {
          if (c.isWriteIn || /write[\s-]?in/i.test(c.cn)) {
            sawWriteIn = true
            writeIns += Number(c.vc) || 0
          } else {
            named.set(c.cn, (named.get(c.cn) ?? 0) + (Number(c.vc) || 0))
          }
        }
        for (const c of town.wc ?? []) {
          sawWriteIn = true
          writeIns += Number(c.vc) || 0
        }
      }
      out.push({
        state: 'VT',
        ...spec,
        candidates: [...[...named].map(([name, votes]) => ({ name, votes })), ...(sawWriteIn ? [{ name: 'Write-in', votes: writeIns }] : [])],
        unitsReporting: towns.reporting,
        unitsTotal: towns.total,
        unitLabel: 'towns',
      })
    }
  }
  return out
}

/** "63/247" → { reporting: 63, total: 247 }. */
export function parseTownsReporting(s: string | undefined): { reporting: number; total: number } {
  const m = String(s ?? '').match(/(\d+)\s*(?:\/|OF)\s*(\d+)/i)
  return m ? { reporting: Number(m[1]), total: Number(m[2]) } : { reporting: 0, total: 0 }
}

/** `elections\<guid>-f-20261103201109.json` → URL and stamp. */
export function vermontFile(entry: { isEnable?: boolean; path?: string } | undefined): { url: string; stamp: number } | null {
  if (!entry?.isEnable || !entry.path) return null
  const path = entry.path.replace(/\\/g, '/').replace(/^\/+/, '')
  return { url: `${BASE}/${path}`, stamp: Number(path.match(/-(\d{14})\.json$/)?.[1] ?? 0) }
}

export const vt: FeedAdapter = {
  state: 'VT',
  source: 'Vermont Secretary of State',
  sourceUrl: 'https://electionresults.vermont.gov/',
  async load(prevVersion) {
    const index = await getJson<VermontIndex>(`${BASE}/elections/${ELECTION_GUID}.json`, this.source)
    const federal = vermontFile(index.federal)
    const state = vermontFile(index.stateWide)
    const stamp = Math.max(federal?.stamp ?? 0, state?.stamp ?? 0)
    if (stamp && prevVersion === stamp) return { version: stamp }
    const [fed, sw] = await Promise.all([
      federal ? getJson<VermontFile>(federal.url, this.source) : Promise.resolve({}),
      state ? getJson<VermontFile>(state.url, this.source) : Promise.resolve({}),
    ])
    const towns = parseTownsReporting(index.townsReporting)
    const races = [...parseVermont(sw, towns), ...parseVermont(fed, towns)]
    return stamp ? { version: stamp, races } : { version: countsFingerprint(races), unordered: true, races }
  },
}
