import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, type FeedAdapter } from './http'

/**
 * Virginia Department of Elections ENR (Enhanced Voting). The /data endpoint
 * (about 1.5 MB) holds statewide totals per contest with a reporting status
 * and an `asOf` time, used as the version. County results are left out.
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
    })
  }
  return { version, races }
}

export const virginia: FeedAdapter = {
  state: 'VA',
  source: 'Virginia Department of Elections',
  sourceUrl: 'https://enr.elections.virginia.gov/results/public/virginia/elections/2026-November-General',
  async load() {
    return parseVirginia(await getJson<VirginiaData>(URL, this.source))
  },
}
