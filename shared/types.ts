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
  candidates: Candidate[]
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
