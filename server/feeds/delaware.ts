import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, countsFingerprint, type FeedAdapter } from './http'

/**
 * Delaware Department of Elections results on the state open-data portal
 * (Socrata dataset yg7x-kgjc): one row per candidate, statewide only, with
 * no reporting-unit counts. A fingerprint of the counts stands in for a version.
 * Each row also splits the count into machine, early and absentee votes.
 */
const URL = 'https://data.delaware.gov/resource/yg7x-kgjc.json?election_name=2026%20General%20Election&$limit=1000'

export interface DelawareRow {
  office: string
  candidate_name: string
  total_votes: string
  machine_votes?: string
  early_votes?: string
  absentee_votes?: string
}

/** The state's own column names, in its order. */
const VOTE_TYPES = [
  ['machine_votes', 'Machine'],
  ['early_votes', 'Early'],
  ['absentee_votes', 'Absentee'],
] as const

const count = (s: string | undefined) => Number(String(s ?? '').replace(/,/g, '')) || 0

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
      byOffice.set(key, {
        state: 'DE',
        ...kind,
        candidates: [],
        unitsReporting: 0,
        unitsTotal: 0,
        unitLabel: '',
        byType: { types: VOTE_TYPES.map(([, label]) => label), votes: [] },
      })
    }
    const race = byOffice.get(key)!
    race.candidates.push({ name: row.candidate_name, votes: count(row.total_votes) })
    race.byType!.votes.push(VOTE_TYPES.map(([field]) => count(row[field])))
  }
  // A dataset without the split columns gives no split, not a row of zeros.
  // Socrata leaves out null fields. A race with any split column missing gives no split, not a false 0.
  const partial = new Set<string>()
  for (const row of rows) {
    const kind = delawareKind(row.office?.trim() ?? '')
    if (kind && VOTE_TYPES.some(([field]) => row[field] == null)) partial.add(`${kind.kind}|${kind.district}`)
  }
  for (const key of partial) delete byOffice.get(key)!.byType
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
