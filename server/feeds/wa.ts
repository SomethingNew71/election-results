import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, type FeedAdapter } from './http'

/**
 * Washington Secretary of State ENR (Enhanced Voting, results.votewa.gov).
 * The `/data` endpoint (about 550 KB) holds statewide totals per contest with
 * a reporting status and an `asOf` time, used as the version. Washington has
 * no US Senate or governor race in 2026, only the 10 House districts.
 * Units are counties (`reportingUnits` of `totalUnits`).
 */
const URL = 'https://results.votewa.gov/results/public/api/elections/washington/20261103/data'

type Text = { languageId: string; text: string }[]
const en = (t: Text | string) => (typeof t === 'string' ? t : (t.find((x) => x.languageId === 'en') ?? t[0])?.text ?? '')

export function waKind(name: string): { kind: RaceKind; district: string | null } | null {
  const m = name.match(/^Congressional District (\d+) - U\.S\. Representative$/i)
  return m ? { kind: 'house', district: `WA-${m[1]!.padStart(2, '0')}` } : null
}

export interface WaData {
  ballotItems: {
    id?: string
    name: Text
    reportingStatus?: { reportingUnits: number; totalUnits: number; asOf: string }
    summaryResults?: { ballotOptions: { name: Text; voteCount: number; isWriteIn: boolean }[] }
  }[]
}

export function parseWa(data: WaData): { version: number; races: FeedRace[] } {
  let version = 0
  const races: FeedRace[] = []
  for (const item of data.ballotItems ?? []) {
    const kind = waKind(en(item.name))
    if (!kind) continue
    version = Math.max(version, Date.parse(item.reportingStatus?.asOf ?? '') || 0)
    const options = item.summaryResults?.ballotOptions ?? []
    const writeIns = options.filter((o) => o.isWriteIn)
    races.push({
      state: 'WA',
      ...kind,
      candidates: [
        ...options.filter((o) => !o.isWriteIn).map((o) => ({ name: en(o.name), votes: Number(o.voteCount) || 0 })),
        ...(writeIns.length ? [{ name: 'Write-in', votes: writeIns.reduce((n, o) => n + (Number(o.voteCount) || 0), 0) }] : []),
      ],
      unitsReporting: item.reportingStatus?.reportingUnits ?? 0,
      unitsTotal: item.reportingStatus?.totalUnits ?? 0,
      unitLabel: 'counties',
      ref: item.id,
    })
  }
  return { version, races }
}

export const wa: FeedAdapter = {
  state: 'WA',
  source: 'Washington Secretary of State',
  sourceUrl: 'https://results.votewa.gov/results/public/washington/elections/20261103',
  async load() {
    const { version, races } = parseWa(await getJson<WaData>(URL, this.source))
    return { version, races }
  },
}
