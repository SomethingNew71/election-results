export type RaceKind = 'senate' | 'governor' | 'house'

export interface Candidate {
  name: string
  party: string
  /** Party colour (see shared/utils/parties.ts), not civicAPI's per-candidate colour. */
  color: string
  votes: number
  winner: boolean
  incumbent?: boolean
}

export interface RaceSummary {
  id: number
  kind: RaceKind
  name: string
  /** Two-letter postal code. */
  state: string
  /** District label such as "TX-20"; null for statewide races. */
  district: string | null
  pct: number
  /** True when `pct` was scaled from a state feed rather than read from civicAPI. */
  pctEstimated?: boolean
  candidates: Candidate[]
  crossCheck?: CrossCheck
}

/** One race as an official state feed reports it. */
export interface FeedRace {
  state: string
  kind: RaceKind
  district: string | null
  candidates: { name: string; votes: number }[]
  /** Reporting units (counties) with results, and the total. */
  unitsReporting: number
  unitsTotal: number
}

export interface CrossCheck {
  source: string
  sourceUrl: string
  fetchedAt: string
  /** The feed's own version stamp, when it has one. */
  version: string | null
  feedTotal: number
  civicTotal: number
  unitsReporting: number
  unitsTotal: number
  /** Every civicAPI candidate was found in the feed. */
  matched: boolean
  /** The feed's counts are the ones shown. */
  used: boolean
  differences: { name: string; civic: number; feed: number }[]
}

export interface ChamberTotals {
  kind: RaceKind
  /** Seats in the chamber that are not on the ballot, keyed by party. */
  holdovers: Record<string, number>
  totalSeats: number
}

export interface Freshness {
  /** When the server last got this data from civicAPI. */
  dataAsOf: string
  /** True when civicAPI failed and an older copy is shown. */
  stale: boolean
}

export interface Overview extends Freshness {
  races: RaceSummary[]
  chambers: ChamberTotals[]
}

export interface RegionResult {
  key: string
  name: string
  fips: string | null
  pct: number
  candidates: Candidate[]
}

export interface RaceDetail extends RaceSummary, Freshness {
  pollsClose: string | null
  lastUpdated: string | null
  registeredVoters: number | null
  testData: boolean
  disputed: boolean
  regions: RegionResult[]
}
