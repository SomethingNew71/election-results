import type { FeedRace, RaceKind, VoteTypeCounts } from '#shared/types'
import { alignByName, getJson, type FeedAdapter } from './http'

/**
 * Virginia Department of Elections ENR (Enhanced Voting). The /data endpoint
 * (about 1.5 MB) holds statewide totals per contest with a reporting status
 * and an `asOf` time, used as the version. County results are left out.
 * `/data/ballot-item/{id}` (about 2 MB) splits one contest by vote type.
 */
const URL = 'https://enr.elections.virginia.gov/results/public/api/elections/virginia/2026-November-General/data'

type Text = { languageId: string; text: string }[]
const en = (t: Text | string) => (typeof t === 'string' ? t : (t.find((x) => x.languageId === 'en') ?? t[0])?.text ?? '')

export function virginiaKind(name: string): { kind: RaceKind; district: string | null } | null {
  if (/^Member, United States Senate$/i.test(name)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(name)) return { kind: 'governor', district: null }
  const m = name.match(/^Member, House of Representatives \((\d+)(?:st|nd|rd|th) District\)$/i)
  return m ? { kind: 'house', district: `VA-${m[1]!.padStart(2, '0')}` } : null
}

export interface VirginiaData {
  ballotItems: {
    id?: string
    name: Text
    reportingStatus?: { reportingUnits: number; totalUnits: number; asOf: string }
    summaryResults?: { ballotOptions: { name: Text; voteCount: number; isWriteIn: boolean }[] }
  }[]
}

export function parseVirginia(data: VirginiaData): { version: number; races: FeedRace[] } {
  let version = 0
  const races: FeedRace[] = []
  for (const item of data.ballotItems ?? []) {
    const kind = virginiaKind(en(item.name))
    if (!kind) continue
    version = Math.max(version, Date.parse(item.reportingStatus?.asOf ?? '') || 0)
    const options = item.summaryResults?.ballotOptions ?? []
    const writeIns = options.filter((o) => o.isWriteIn)
    races.push({
      state: 'VA',
      ...kind,
      candidates: [
        ...options.filter((o) => !o.isWriteIn).map((o) => ({ name: en(o.name), votes: Number(o.voteCount) || 0 })),
        ...(writeIns.length ? [{ name: 'Write-in', votes: writeIns.reduce((n, o) => n + (Number(o.voteCount) || 0), 0) }] : []),
      ],
      unitsReporting: item.reportingStatus?.reportingUnits ?? 0,
      unitsTotal: item.reportingStatus?.totalUnits ?? 0,
      unitLabel: 'localities',
      ref: item.id,
    })
  }
  return { version, races }
}

export interface VirginiaBreakdown {
  ballotItemWithBreakdown?: {
    summaryResults?: {
      ballotOptions: { name: Text; isWriteIn: boolean; groupResults?: { groupName: Text; voteCount: number }[] }[]
    }
  } | null
}

export function parseVirginiaBreakdown(race: FeedRace, data: VirginiaBreakdown): VoteTypeCounts | null {
  const options = data.ballotItemWithBreakdown?.summaryResults?.ballotOptions ?? []
  const types: string[] = []
  for (const o of options) for (const g of o.groupResults ?? []) if (!types.includes(en(g.groupName))) types.push(en(g.groupName))
  if (types.length < 2) return null
  const rows = options.map((o) => {
    const by = new Map((o.groupResults ?? []).map((g) => [en(g.groupName), Number(g.voteCount) || 0]))
    return { name: en(o.name), writeIn: o.isWriteIn, votes: types.map((t) => by.get(t) ?? 0) }
  })
  const votes = alignByName(race.candidates, rows, types.length)
  return votes && { types, votes }
}

export const virginia: FeedAdapter = {
  state: 'VA',
  source: 'Virginia Department of Elections',
  sourceUrl: 'https://enr.elections.virginia.gov/results/public/virginia/elections/2026-November-General',
  async load() {
    return parseVirginia(await getJson<VirginiaData>(URL, this.source))
  },
  async voteTypes(race) {
    if (!race.ref) return null
    return parseVirginiaBreakdown(race, await getJson<VirginiaBreakdown>(`${URL}/ballot-item/${encodeURIComponent(race.ref)}`, this.source))
  },
}
