import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, countsFingerprint, type FeedAdapter } from './http'

/**
 * Louisiana Secretary of State live results (voterportal.sos.la.gov). Two small
 * static JSON files per election: the race list (about 50 KB) and the votes
 * (about 27 KB). Votes carry only choice ids; names come from the race list.
 * `VersionDateTime` on the votes file is the version.
 */
const BASE = 'https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob=20261103'
const RACES_URL = `${BASE}/RacesCandidates_Multiparish.htm`
const VOTES_URL = `${BASE}/Votes_Multiparish.htm`

export interface LaRaceList {
  Races: {
    Race: { ID: string; SpecificTitle: string; Choice?: { ID: string; Desc: string }[] | { ID: string; Desc: string } }[]
  }
}
export interface LaVotes {
  Races: {
    VersionDateTime?: string
    Race: {
      ID: string
      PrecinctsReporting: string
      PrecinctsExpected: string
      Choice?: { ID: string; VoteTotal: string }[] | { ID: string; VoteTotal: string }
    }[]
  }
}

const list = <T>(v: T[] | T | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

export function laKind(title: string): { kind: RaceKind; district: string | null } | null {
  const t = title.replace(/\s+/g, ' ').trim()
  if (/^U\. ?S\. Senator$/i.test(t)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(t)) return { kind: 'governor', district: null }
  const m = t.match(/^U\. ?S\. Representative -- (\d+)(?:st|nd|rd|th) Congressional District$/i)
  return m ? { kind: 'house', district: `LA-${m[1]!.padStart(2, '0')}` } : null
}

/** `"Jamie" Davis (DEM)` → `Jamie Davis`. */
export function laName(desc: string): string {
  return desc
    .replace(/\s*\([A-Za-z]+\)\s*$/, '')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseLa(raceList: LaRaceList, votes: LaVotes): FeedRace[] {
  const votesById = new Map(list(votes.Races?.Race).map((r) => [r.ID, r]))
  const out: FeedRace[] = []
  for (const race of list(raceList.Races?.Race)) {
    const kind = laKind(race.SpecificTitle ?? '')
    if (!kind) continue
    const v = votesById.get(race.ID)
    if (!v) continue
    const counts = new Map(list(v.Choice).map((c) => [c.ID, Number(c.VoteTotal) || 0]))
    let writeIn = 0
    let sawWriteIn = false
    const candidates: { name: string; votes: number }[] = []
    for (const c of list(race.Choice)) {
      const n = counts.get(c.ID) ?? 0
      if (/write-?\s?in/i.test(c.Desc)) {
        writeIn += n
        sawWriteIn = true
      } else candidates.push({ name: laName(c.Desc), votes: n })
    }
    if (sawWriteIn) candidates.push({ name: 'Write-in', votes: writeIn })
    out.push({
      state: 'LA',
      ...kind,
      candidates,
      unitsReporting: Number(v.PrecinctsReporting) || 0,
      unitsTotal: Number(v.PrecinctsExpected) || 0,
      unitLabel: 'precincts',
    })
  }
  return out
}

export const la: FeedAdapter = {
  state: 'LA',
  source: 'Louisiana Secretary of State',
  sourceUrl: 'https://voterportal.sos.la.gov/graphical',
  async load() {
    const [raceList, votes] = await Promise.all([getJson<LaRaceList>(RACES_URL, this.source), getJson<LaVotes>(VOTES_URL, this.source)])
    const races = parseLa(raceList, votes)
    // Not VersionDateTime: the 2024 file has real votes under the stamp 1900-01-01, which would freeze the feed.
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
