import type { FeedRace } from '#shared/types'
import { getJson, leadingInt, countsFingerprint, type FeedAdapter } from './http'

/**
 * California Secretary of State election night results (electionresults.sos.ca.gov).
 * The page's own JSON links point at api.sos.ca.gov: `/returns/governor` and
 * `/returns/us-rep/district/all` (all 52 districts in one ~27 KB response).
 * California has no US Senate race in 2026. The feed has a display time but no
 * numeric stamp, so a fingerprint of the counts stands in for a version.
 */
const API = 'https://api.sos.ca.gov/returns'

export interface CaRace {
  raceTitle: string
  /** "37% (1,234 of 23,860) precincts reporting" */
  Reporting?: string
  candidates: { Name: string; Party?: string; Votes: string | number }[]
}

export function caKind(title: string): { kind: 'governor' | 'house'; district: string | null } | null {
  if (/^Governor\b/i.test(title)) return { kind: 'governor', district: null }
  const m = title.match(/^U\.S\. House of Representatives District (\d+)\b/i)
  return m ? { kind: 'house', district: `CA-${m[1]!.padStart(2, '0')}` } : null
}

export function parseCa(races: CaRace[]): FeedRace[] {
  const out: FeedRace[] = []
  for (const r of races) {
    const kind = caKind(r.raceTitle ?? '')
    if (!kind) continue
    const m = (r.Reporting ?? '').match(/\(([\d,]+) of ([\d,]+)\)/)
    const people = r.candidates.filter((c) => !/^write-?in/i.test(c.Name))
    const writeIns = r.candidates.filter((c) => /^write-?in/i.test(c.Name))
    out.push({
      state: 'CA',
      ...kind,
      candidates: [
        ...people.map((c) => ({ name: c.Name, votes: leadingInt(c.Votes) })),
        ...(writeIns.length ? [{ name: 'Write-in', votes: writeIns.reduce((n, c) => n + leadingInt(c.Votes), 0) }] : []),
      ],
      unitsReporting: m ? leadingInt(m[1]) : 0,
      unitsTotal: m ? leadingInt(m[2]) : 0,
      unitLabel: 'precincts',
    })
  }
  return out
}

export const ca: FeedAdapter = {
  state: 'CA',
  source: 'California Secretary of State',
  sourceUrl: 'https://electionresults.sos.ca.gov/',
  async load() {
    const [gov, house] = await Promise.all([
      getJson<CaRace>(`${API}/governor`, this.source),
      getJson<CaRace[]>(`${API}/us-rep/district/all`, this.source),
    ])
    const races = parseCa([gov, ...house])
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
