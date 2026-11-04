import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, type FeedAdapter } from './http'

/**
 * Idaho Secretary of State results (results.voteidaho.gov, Enhanced Voting).
 * The `/data` endpoint (about 500 KB) holds statewide totals per contest with
 * a publish time (`asOf`), used as the version. Reporting units are counties.
 */
const URL = 'https://results.voteidaho.gov/results/public/api/elections/id/nov2026/data'

type Text = { languageId: string; text: string }[]
const en = (t: Text | string) => (typeof t === 'string' ? t : (t.find((x) => x.languageId === 'en') ?? t[0])?.text ?? '')

export function idahoKind(name: string): { kind: RaceKind; district: string | null } | null {
  if (/^United States Senator$/i.test(name)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(name)) return { kind: 'governor', district: null }
  const m = name.match(/^United States Representative District (\d+)$/i)
  return m ? { kind: 'house', district: `ID-${m[1]!.padStart(2, '0')}` } : null
}

export interface IdahoData {
  election?: { asOf?: string }
  ballotItems: {
    name: Text
    reportingStatus?: { reportingUnits: number; totalUnits: number; asOf: string }
    summaryResults?: { ballotOptions: { name: Text; voteCount: number; isWriteIn: boolean }[] }
  }[]
}

export function parseIdaho(data: IdahoData): { version: number; races: FeedRace[] } {
  let version = Date.parse(data.election?.asOf ?? '') || 0
  const races: FeedRace[] = []
  for (const item of data.ballotItems ?? []) {
    const kind = idahoKind(en(item.name).trim())
    if (!kind) continue
    version = Math.max(version, Date.parse(item.reportingStatus?.asOf ?? '') || 0)
    const options = item.summaryResults?.ballotOptions ?? []
    const writeIns = options.filter((o) => o.isWriteIn)
    races.push({
      state: 'ID',
      ...kind,
      candidates: [
        ...options.filter((o) => !o.isWriteIn).map((o) => ({ name: en(o.name).trim(), votes: Number(o.voteCount) || 0 })),
        ...(writeIns.length ? [{ name: 'Write-in', votes: writeIns.reduce((n, o) => n + (Number(o.voteCount) || 0), 0) }] : []),
      ],
      unitsReporting: item.reportingStatus?.reportingUnits ?? 0,
      unitsTotal: item.reportingStatus?.totalUnits ?? 0,
      unitLabel: 'counties',
    })
  }
  return { version, races }
}

export const id: FeedAdapter = {
  state: 'ID',
  source: 'Idaho Secretary of State',
  sourceUrl: 'https://results.voteidaho.gov/results/public/id/elections/nov2026',
  async load() {
    return parseIdaho(await getJson<IdahoData>(URL, this.source))
  },
}
