import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, countsFingerprint, leadingInt, type FeedAdapter } from './http'

/**
 * Connecticut Secretary of the State election night reporting
 * (ctemspublic.tgstg.net, the site the Secretary's page links as "2026
 * Connecticut Election Results"; an AngularJS app over static JSON).
 * Four requests per load, about 250 KB in all:
 *   1. `Version.json`: a number that rises with each publish (the version).
 *   2. `<version>/Lookupdata.json` (213 KB): office, candidate and party names by id.
 *   3. `<version>/stateVotes_Electiondata.json` (32 KB): statewide votes by office id, then candidate id.
 *   4. `<version>/election_Electiondata.json`: precincts reported ("0 of 776 (0%)").
 * One person can run on several party lines (Lamont on Democratic and Working
 * Families) with a separate candidate id per line, so lines are summed by name.
 * Named write-ins sit on the party "Write In"; they go to one "Write-in" row.
 * Connecticut has no US Senate race in 2026.
 */
const BASE = 'https://ctemspublic.tgstg.net/ng-app/data/election'
/** "11/03/2026 -- November 2026 State Election" in `ng-app/data/Elections.json`. */
const ELECTION_ID = 108

export interface ConnecticutLookup {
  officeList?: Record<string, { ID: string; NM: string }>[]
  candidateIds?: Record<string, { NM: string; P?: string }>
  partyIds?: Record<string, { NM: string }>
}

/** Votes by office id → list of { candidate id → { V: votes } }. */
export type ConnecticutVotes = Record<string, Record<string, { V?: string }>[]>

export function connecticutKind(name: string): { kind: RaceKind; district: string | null } | null {
  const n = name.trim()
  if (/^(?:U\.?S\.? Senat|United States Senat)/i.test(n)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(n)) return { kind: 'governor', district: null }
  const m = n.match(/^Representative in Congress (\d+)$/i)
  return m ? { kind: 'house', district: `CT-${m[1]!.padStart(2, '0')}` } : null
}

export function parseConnecticut(lookup: ConnecticutLookup, votes: ConnecticutVotes, precincts: { reporting: number; total: number }): FeedRace[] {
  const out: FeedRace[] = []
  for (const entry of lookup.officeList ?? []) {
    for (const [id, office] of Object.entries(entry)) {
      const kind = connecticutKind(office.NM ?? '')
      const rows = votes[id]
      if (!kind || !rows) continue
      const named = new Map<string, number>()
      let writeIns = 0
      let sawWriteIn = false
      for (const row of rows) {
        for (const [cid, v] of Object.entries(row)) {
          const cand = lookup.candidateIds?.[cid]
          if (!cand) continue
          const n = leadingInt(v.V)
          if (/write[\s-]?in/i.test(lookup.partyIds?.[cand.P ?? '']?.NM ?? '') || /write[\s-]?in/i.test(cand.NM)) {
            sawWriteIn = true
            writeIns += n
          } else {
            // A governor ticket is "Name and Running Mate"; the feed keys on the first person.
            const name = cand.NM.split(/\s+and\s+/i)[0]!.trim()
            named.set(name, (named.get(name) ?? 0) + n)
          }
        }
      }
      out.push({
        state: 'CT',
        ...kind,
        candidates: [...[...named].map(([name, v]) => ({ name, votes: v })), ...(sawWriteIn ? [{ name: 'Write-in', votes: writeIns }] : [])],
        unitsReporting: precincts.reporting,
        unitsTotal: precincts.total,
        unitLabel: 'precincts statewide',
      })
    }
  }
  return out
}

/** "0 of 776 (0%)" → { reporting: 0, total: 776 }. */
export function parsePrecincts(s: string | undefined): { reporting: number; total: number } {
  const m = String(s ?? '').match(/(\d[\d,]*)\s+of\s+(\d[\d,]*)/i)
  return m ? { reporting: leadingInt(m[1]), total: leadingInt(m[2]) } : { reporting: 0, total: 0 }
}

export const ct: FeedAdapter = {
  state: 'CT',
  source: 'Connecticut Secretary of the State',
  sourceUrl: 'https://ctemspublic.tgstg.net/#/home',
  async load(prevVersion) {
    const root = `${BASE}/${ELECTION_ID}`
    const { Version } = await getJson<{ Version: string | number }>(`${root}/Version.json`, this.source)
    const version = Number(Version)
    if (version && prevVersion === version) return { version }
    const [lookup, votes, election] = await Promise.all([
      getJson<ConnecticutLookup>(`${root}/${version}/Lookupdata.json`, this.source),
      getJson<ConnecticutVotes>(`${root}/${version}/stateVotes_Electiondata.json`, this.source),
      getJson<{ PR?: string }>(`${root}/${version}/election_Electiondata.json`, this.source),
    ])
    const races = parseConnecticut(lookup, votes, parsePrecincts(election.PR))
    return version ? { version, races } : { version: countsFingerprint(races), unordered: true, races }
  },
}
