import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, type FeedAdapter } from './http'

/**
 * Utah Elections Office results (electionresults.utah.gov, Enhanced Voting).
 * The `/data` endpoint (about 300 KB) holds statewide totals per contest with
 * a publish time (`asOf`), used as the version. Only counties are reporting units.
 * Utah has no US Senate or governor race in 2026.
 */
const URL = 'https://electionresults.utah.gov/results/public/api/elections/Utah/General11032026/data'

type Text = { languageId: string; text: string }[]
const en = (t: Text | string) => (typeof t === 'string' ? t : (t.find((x) => x.languageId === 'en') ?? t[0])?.text ?? '')

/** The state prints names in capitals ("BEN MCADAMS"). */
export function utahName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (s !== s.toUpperCase()) return s
  return s
    .toLowerCase()
    .replace(/(^|[\s"(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => 'Mc' + c.toUpperCase())
}

export function utahKind(name: string): { kind: RaceKind; district: string | null } | null {
  if (/^U\.S\. Senat/i.test(name)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(name)) return { kind: 'governor', district: null }
  const m = name.match(/^U\.S\. House District (\d+)$/i)
  return m ? { kind: 'house', district: `UT-${m[1]!.padStart(2, '0')}` } : null
}

export interface UtahData {
  election?: { asOf?: string }
  ballotItems: {
    name: Text
    reportingStatus?: { reportingUnits: number; totalUnits: number; asOf: string }
    summaryResults?: { ballotOptions: { name: Text; voteCount: number; isWriteIn: boolean }[] }
  }[]
}

export function parseUtah(data: UtahData): { version: number; races: FeedRace[] } {
  let version = Date.parse(data.election?.asOf ?? '') || 0
  const races: FeedRace[] = []
  for (const item of data.ballotItems ?? []) {
    const kind = utahKind(en(item.name).trim())
    if (!kind) continue
    version = Math.max(version, Date.parse(item.reportingStatus?.asOf ?? '') || 0)
    const options = item.summaryResults?.ballotOptions ?? []
    const writeIns = options.filter((o) => o.isWriteIn)
    races.push({
      state: 'UT',
      ...kind,
      candidates: [
        ...options.filter((o) => !o.isWriteIn).map((o) => ({ name: utahName(en(o.name)), votes: Number(o.voteCount) || 0 })),
        ...(writeIns.length ? [{ name: 'Write-in', votes: writeIns.reduce((n, o) => n + (Number(o.voteCount) || 0), 0) }] : []),
      ],
      unitsReporting: item.reportingStatus?.reportingUnits ?? 0,
      unitsTotal: item.reportingStatus?.totalUnits ?? 0,
      unitLabel: 'counties',
    })
  }
  return { version, races }
}

export const ut: FeedAdapter = {
  state: 'UT',
  source: 'Utah Elections Office',
  sourceUrl: 'https://electionresults.utah.gov/results/public/Utah/elections/General11032026',
  async load() {
    return parseUtah(await getJson<UtahData>(URL, this.source))
  },
}
