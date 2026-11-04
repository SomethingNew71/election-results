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
  /** Non-voting House delegate (DC and the territories): off the map and out of the seat count. */
  delegate?: boolean
  crossCheck?: CrossCheck
}

/** One race as an official state feed reports it. */
export interface FeedRace {
  state: string
  kind: RaceKind
  district: string | null
  candidates: { name: string; votes: number }[]
  /** Reporting units with results, and the total; 0 of 0 when the feed gives none. */
  unitsReporting: number
  unitsTotal: number
  /** What a unit is in this feed: "counties", "precincts", "localities". */
  unitLabel: string
  /** County breakdown; `votes` follows the order of `candidates`. */
  regions?: FeedRegion[]
  /** Votes by vote type when the feed gives them inline. */
  byType?: VoteTypeCounts
  /** The feed's own id for this contest, for a per-contest vote-type request. */
  ref?: string
}

/** Votes by vote type ("Early Voting", "Election Day"), as the state labels them. */
export interface VoteTypeCounts {
  types: string[]
  /** One row per candidate, in the order of the feed race's `candidates`; one column per type. */
  votes: number[][]
}

export interface VoteTypeBreakdown extends VoteTypeCounts {
  /** The state's candidate names, one per row of `votes`. */
  candidates: string[]
  source: string
  sourceUrl: string
  checkedAt: string
}

export interface FeedRegion {
  name: string
  /** 5-digit county FIPS when the feed gives one. */
  fips?: string
  precinctsReporting: number
  precinctsTotal: number
  votes: number[]
}

export interface CrossCheck {
  source: string
  sourceUrl: string
  /** When the shown version was downloaded. */
  fetchedAt: string
  /** When the feed was last checked for a new version. */
  checkedAt: string
  /** The feed's own version stamp, when it has one. */
  version: string | null
  feedTotal: number
  civicTotal: number
  unitsReporting: number
  unitsTotal: number
  unitLabel: string
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
  /** Where `regions` came from. */
  regionSource: 'civicapi' | 'state'
  /**
   * civicAPI's regions when `regions` are the state's. Projections use these:
   * a state county's % is precincts fully reported, which overstates the
   * votes left where mail ballots are counted first.
   */
  projectionRegions: RegionResult[] | null
  pollsClose: string | null
  lastUpdated: string | null
  registeredVoters: number | null
  testData: boolean
  disputed: boolean
  regions: RegionResult[]
  /** The state's count split by vote type, when its feed publishes one. */
  voteTypes: VoteTypeBreakdown | null
}
