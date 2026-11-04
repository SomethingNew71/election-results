import type { FeedRace } from '#shared/types'
import { getJson, countsFingerprint, type FeedAdapter } from './http'

/**
 * Pennsylvania Department of State election returns (electionreturns.pa.gov).
 * The page is an AngularJS app over `api/ElectionReturn/*`; every call answers
 * a JSON string that holds JSON. Pennsylvania has no US Senate race in 2026.
 * Write-ins are not published. The feed has no version stamp, so a
 * fingerprint of the counts stands in. "Districts" are the state's voting districts (precincts).
 */
const ROOT = 'https://www.electionreturns.pa.gov/api/ElectionReturn'
const ELECTION = 'electionid=117&electiontype=G&isactive=1'
const URLS = {
  summary: `${ROOT}/GET?methodName=GetSummaryData&${ELECTION}`,
  house: `${ROOT}/GetOfficeData?officeId=11&methodName=GetOfficeDetails&${ELECTION}`,
  offices: `${ROOT}/GetOfficeNames?countyName=&methodName=GetOfficeNames&${ELECTION}`,
}

interface PaCandidate {
  CandidateName: string
  Votes: string
}
export interface PaSummary {
  Election?: { Governor?: { Statewide?: PaCandidate[] }[] }
}
export interface PaHouse {
  Election?: {
    'Representative in Congress'?: Record<string, { DistrictId: string; District: string; Candidates: PaCandidate[] }[]>[]
  }
}
export interface PaOffices {
  Table1?: { DashboardMessage?: string }[]
}

/** "RICHARD MC DONALD JR" → "Richard Mc Donald Jr". Matching uses the last name only. */
export function paName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
}

const people = (list: PaCandidate[]) => list.map((c) => ({ name: paName(c.CandidateName), votes: Number(String(c.Votes).replace(/,/g, '')) || 0 }))

/** "1st Congressional District" → "PA-01". */
export function paDistrict(label: string): string | null {
  const m = label.match(/^(\d+)(?:st|nd|rd|th) Congressional District/i)
  return m ? `PA-${m[1]!.padStart(2, '0')}` : null
}

export function parsePa(summary: PaSummary, house: PaHouse, offices: PaOffices): FeedRace[] {
  let reporting = 0
  let total = 0
  try {
    const msg = JSON.parse(offices.Table1?.[0]?.DashboardMessage ?? '{}') as { ReportingDistrict?: string; VotingDistrict?: string }
    reporting = Number(msg.ReportingDistrict) || 0
    total = Number(msg.VotingDistrict) || 0
  } catch {
    // A changed message gives 0 of 0, not a guess.
  }
  const units = { unitsReporting: reporting, unitsTotal: total, unitLabel: 'voting districts statewide' }
  const out: FeedRace[] = []
  const gov = summary.Election?.Governor?.[0]?.Statewide
  if (gov?.length) out.push({ state: 'PA', kind: 'governor', district: null, candidates: people(gov), ...units })
  for (const group of house.Election?.['Representative in Congress'] ?? []) {
    for (const rows of Object.values(group)) {
      for (const row of rows) {
        const district = paDistrict(row.District)
        if (district) out.push({ state: 'PA', kind: 'house', district, candidates: people(row.Candidates), ...units })
      }
    }
  }
  return out
}

/** The API answers a JSON string; some answers are an empty string. */
const inner = <T>(v: unknown): T => (typeof v === 'string' ? (v.trim() ? (JSON.parse(v) as T) : ({} as T)) : ((v ?? {}) as T))

export const pa: FeedAdapter = {
  state: 'PA',
  source: 'Pennsylvania Department of State',
  sourceUrl: 'https://www.electionreturns.pa.gov/',
  async load() {
    const [summary, house, offices] = await Promise.all([
      getJson<unknown>(URLS.summary, this.source),
      getJson<unknown>(URLS.house, this.source),
      getJson<unknown>(URLS.offices, this.source),
    ])
    const races = parsePa(inner(summary), inner(house), inner(offices))
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
