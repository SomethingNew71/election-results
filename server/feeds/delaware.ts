import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, countsFingerprint, type FeedAdapter } from './http'

/**
 * Delaware Department of Elections results on the state open-data portal
 * (Socrata dataset yg7x-kgjc): one row per candidate, statewide only, with
 * no reporting-unit counts. A fingerprint of the counts stands in for a version.
 */
const URL = 'https://data.delaware.gov/resource/yg7x-kgjc.json?election_name=2026%20General%20Election&$limit=1000'

export interface DelawareRow {
  office: string
  candidate_name: string
  total_votes: string
}

export function delawareKind(office: string): { kind: RaceKind; district: string | null } | null {
  if (/^U\.S\. Senator$/i.test(office)) return { kind: 'senate', district: null }
  if (/^Governor/i.test(office)) return { kind: 'governor', district: null }
  if (/^Representative in Congress$/i.test(office)) return { kind: 'house', district: 'DE-AL' }
  return null
}

export function parseDelaware(rows: DelawareRow[]): FeedRace[] {
  const byOffice = new Map<string, FeedRace>()
  for (const row of rows) {
    const kind = delawareKind(row.office?.trim() ?? '')
    if (!kind) continue
    const key = `${kind.kind}|${kind.district}`
    if (!byOffice.has(key)) {
      byOffice.set(key, { state: 'DE', ...kind, candidates: [], unitsReporting: 0, unitsTotal: 0, unitLabel: '' })
    }
    byOffice.get(key)!.candidates.push({ name: row.candidate_name, votes: Number(String(row.total_votes).replace(/,/g, '')) || 0 })
  }
  return [...byOffice.values()]
}

export const delaware: FeedAdapter = {
  state: 'DE',
  source: 'Delaware Department of Elections',
  sourceUrl: 'https://elections.delaware.gov/results/enr/GE2026.html',
  async load() {
    const races = parseDelaware(await getJson<DelawareRow[]>(URL, this.source))
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
