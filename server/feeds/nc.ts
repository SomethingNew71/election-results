import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, countsFingerprint, type FeedAdapter } from './http'

/**
 * North Carolina State Board of Elections election-night results
 * (er.ncsbe.gov). The page reads `enr/<yyyymmdd>/data/results_0.txt`: one JSON
 * array (about 180 KB) with a row per candidate for every contest that spans
 * more than one county. Each row carries precincts reporting (`prt`) and the
 * precinct total (`ptl`). The only time stamp is a county-level upload time with
 * minute resolution, so a fingerprint of the counts stands in for a version.
 */
const URL = 'https://er.ncsbe.gov/enr/20261103/data/results_0.txt'

export interface NcRow {
  cnm: string
  bnm: string
  vct: string
  prt: string
  ptl: string
}

export function ncKind(contest: string): { kind: RaceKind; district: string | null } | null {
  if (/^US SENATE\b/i.test(contest)) return { kind: 'senate', district: null }
  const m = contest.match(/^US HOUSE OF REPRESENTATIVES DISTRICT (\d+)\b/i)
  return m ? { kind: 'house', district: `NC-${m[1]!.padStart(2, '0')}` } : null
}

export function parseNc(rows: NcRow[]): FeedRace[] {
  const byContest = new Map<string, FeedRace>()
  for (const row of rows) {
    const kind = ncKind(row.cnm ?? '')
    if (!kind) continue
    let race = byContest.get(row.cnm)
    if (!race) {
      race = {
        state: 'NC',
        ...kind,
        candidates: [],
        unitsReporting: Number(row.prt) || 0,
        unitsTotal: Number(row.ptl) || 0,
        unitLabel: 'precincts',
      }
      byContest.set(row.cnm, race)
    }
    const votes = Number(String(row.vct).replace(/,/g, '')) || 0
    if (/^write[\s-]?in/i.test(row.bnm)) {
      const existing = race.candidates.find((c) => c.name === 'Write-in')
      if (existing) existing.votes += votes
      else race.candidates.push({ name: 'Write-in', votes })
    } else {
      race.candidates.push({ name: row.bnm.trim(), votes })
    }
  }
  return [...byContest.values()]
}

export const nc: FeedAdapter = {
  state: 'NC',
  source: 'North Carolina State Board of Elections',
  sourceUrl: 'https://er.ncsbe.gov/?election_dt=11/03/2026&county_id=0&office_id=0&contest=0',
  async load() {
    const races = parseNc(await getJson<NcRow[]>(URL, this.source))
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
