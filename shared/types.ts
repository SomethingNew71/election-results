export type RaceKind = 'senate' | 'governor' | 'house'

export interface Candidate {
  name: string
  party: string
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

export interface Overview {
  updatedAt: string
  races: RaceSummary[]
  chambers: ChamberTotals[]
  partyColors: Record<string, string>
}

export interface RegionResult {
  key: string
  name: string
  fips: string | null
  pct: number
  candidates: Candidate[]
}

export interface RaceDetail extends RaceSummary {
  pollsClose: string | null
  lastUpdated: string | null
  registeredVoters: number | null
  regions: RegionResult[]
}
