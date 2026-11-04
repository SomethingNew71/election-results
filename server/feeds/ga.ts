import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, type FeedAdapter } from './http'

/**
 * Georgia Secretary of State ENR (results.sos.ga.gov, Enhanced Voting, the
 * vendor Virginia uses). The `/data` endpoint (about 1.3 MB) holds statewide
 * totals for every contest, with the counties reporting and an `asOf` time,
 * used as the version. County and precinct results are left out. Candidate
 * names carry party and incumbency tags: "Jon Ossoff (I) (Dem)".
 */
const URL = 'https://results.sos.ga.gov/results/public/api/elections/Georgia/11032026GeneralAndSpecialElection/data'

type Text = { languageId: string; text: string }[]
const en = (t: Text | string) => (typeof t === 'string' ? t : (t.find((x) => x.languageId === 'en') ?? t[0])?.text ?? '')

export function georgiaKind(name: string): { kind: RaceKind; district: string | null } | null {
  if (/^US Senate$/i.test(name)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(name)) return { kind: 'governor', district: null }
  const m = name.match(/^US House of Representatives - District (\d+)\b/i)
  return m ? { kind: 'house', district: `GA-${m[1]!.padStart(2, '0')}` } : null
}

/** "Jon Ossoff (I) (Dem)" → "Jon Ossoff". Nicknames in quotes stay. */
export function georgiaName(raw: string): string {
  return raw.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

export interface GeorgiaData {
  ballotItems: {
    id?: string
    name: Text
    reportingStatus?: { reportingUnits: number; totalUnits: number; asOf: string }
    summaryResults?: { ballotOptions: { name: Text; voteCount: number; isWriteIn: boolean }[] }
  }[]
}

export function parseGeorgia(data: GeorgiaData): { version: number; races: FeedRace[] } {
  let version = 0
  const races: FeedRace[] = []
  for (const item of data.ballotItems ?? []) {
    const kind = georgiaKind(en(item.name))
    if (!kind) continue
    version = Math.max(version, Date.parse(item.reportingStatus?.asOf ?? '') || 0)
    const options = item.summaryResults?.ballotOptions ?? []
    const writeIns = options.filter((o) => o.isWriteIn)
    races.push({
      state: 'GA',
      ...kind,
      candidates: [
        ...options.filter((o) => !o.isWriteIn).map((o) => ({ name: georgiaName(en(o.name)), votes: Number(o.voteCount) || 0 })),
        ...(writeIns.length ? [{ name: 'Write-in', votes: writeIns.reduce((n, o) => n + (Number(o.voteCount) || 0), 0) }] : []),
      ],
      unitsReporting: item.reportingStatus?.reportingUnits ?? 0,
      unitsTotal: item.reportingStatus?.totalUnits ?? 0,
      unitLabel: 'counties',
    })
  }
  return { version, races }
}

export const ga: FeedAdapter = {
  state: 'GA',
  source: 'Georgia Secretary of State',
  sourceUrl: 'https://results.sos.ga.gov/results/public/Georgia/elections/11032026GeneralAndSpecialElection',
  async load() {
    return parseGeorgia(await getJson<GeorgiaData>(URL, this.source))
  },
}
