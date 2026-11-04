import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, countsFingerprint, leadingInt, type FeedAdapter } from './http'

/**
 * Rhode Island Board of Elections results (www.ri.gov/election/results/).
 * The "Data files" page links one JSON file for all statewide contests,
 * hosted on the state's S3 bucket: US Senate, Governor and both House
 * districts in one 4 KB request. The file carries a `last_updated` stamp
 * ("November 22, 2024 05:00 PM", Eastern time, no zone), used as the version.
 * Counts are by precinct. Candidate names carry a party code ("DEM Gabriel
 * Amo") that is dropped here.
 *
 * Not live-verified for 2026: the 2026 file was not published at 8:10 PM ET on
 * 2026-11-03 (S3 answered 403 for the missing key). The format is the one
 * the 2018, 2022 and 2024 files use.
 */
const URL = 'https://rigov.s3.amazonaws.com/election/results/2026/general_election/statewide.json'

export interface RhodeIslandFile {
  last_updated?: string
  contests?: {
    name: string
    precinct_count?: string
    precincts_reporting?: string
    candidates: { name: string; votes: string }[]
  }[]
}

export function rhodeIslandKind(name: string): { kind: RaceKind; district: string | null } | null {
  const n = name.trim()
  if (/^Senator in Congress$/i.test(n)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(n)) return { kind: 'governor', district: null }
  const m = n.match(/^Representative in Congress District (\d+)$/i)
  return m ? { kind: 'house', district: `RI-${m[1]!.padStart(2, '0')}` } : null
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'")
const PARTY = /^(?:DEM|REP|MOD|IND|LIB|GRN|GRE|NPA|UNA|CON|PRO|WOR)\s+/i

export function parseRhodeIsland(file: RhodeIslandFile): FeedRace[] {
  const out: FeedRace[] = []
  for (const contest of file.contests ?? []) {
    const kind = rhodeIslandKind(contest.name ?? '')
    if (!kind) continue
    const candidates: { name: string; votes: number }[] = []
    let writeIns = 0
    let hasWriteIn = false
    for (const c of contest.candidates ?? []) {
      const votes = leadingInt(c.votes)
      if (/^write[\s-]?in/i.test(c.name.trim())) {
        hasWriteIn = true
        writeIns += votes
      } else {
        candidates.push({ name: decode(c.name).replace(PARTY, '').trim(), votes })
      }
    }
    if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIns })
    out.push({
      state: 'RI',
      ...kind,
      candidates,
      unitsReporting: leadingInt(contest.precincts_reporting),
      unitsTotal: leadingInt(contest.precinct_count),
      unitLabel: 'precincts',
    })
  }
  return out
}

export const ri: FeedAdapter = {
  state: 'RI',
  source: 'Rhode Island Board of Elections',
  sourceUrl: 'https://www.ri.gov/election/results/2026/general_election/',
  async load() {
    const file = await getJson<RhodeIslandFile>(URL, this.source)
    const races = parseRhodeIsland(file)
    const stamp = Date.parse(file.last_updated ?? '')
    return Number.isFinite(stamp) ? { version: stamp, races } : { version: countsFingerprint(races), unordered: true, races }
  },
}
