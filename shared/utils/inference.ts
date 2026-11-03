import type { Candidate, RegionResult } from '../types'
import type { ElectionRules } from './rules'

/**
 * Inference statuses. None of these is a race call.
 * "called" only reflects a winner flag published by civicAPI.
 */
export type InferenceStatus =
  | 'no-votes'
  | 'early'
  | 'competitive'
  | 'close'
  | 'runoff'
  | 'rcv'
  | 'lean'
  | 'strong'
  | 'decided'
  | 'called'

export interface ProjectedShare {
  name: string
  party: string
  color: string
  votes: number
  share: number
}

export interface Inference {
  status: InferenceStatus
  leader: Candidate | null
  runnerUp: Candidate | null
  counted: number
  /** Estimated total votes when counting finishes; null with no data. */
  estTotal: number | null
  estRemaining: number | null
  marginVotes: number
  marginShare: number
  leaderShare: number
  /** Share of the remaining two-way vote the runner-up needs to overtake. */
  neededShare: number | null
  projected: ProjectedShare[]
  /** True when the county-weighted projection puts a different candidate ahead. */
  projectionFlips: boolean
}

/** Below this reporting level the count is too small to read. */
export const EARLY_PCT = 10
/** Region percentages under this are too coarse to extrapolate from. */
export const MIN_REGION_PCT = 5
/** A lead under this share of the vote is never shown as out of reach. */
export const CLOSE_MARGIN = 0.005

export const NO_RULES: ElectionRules = { majority: false, rcv: false }

export const STATUS_LABEL: Record<InferenceStatus, string> = {
  'no-votes': 'No votes yet',
  early: 'Too early',
  competitive: 'Competitive',
  close: 'Too close',
  runoff: 'Runoff possible',
  rcv: 'Ranked-choice count',
  lean: 'Lean',
  strong: 'Strong lead',
  decided: 'Out of reach (est.)',
  called: 'Called',
}

export const STATUS_HELP: Record<InferenceStatus, string> = {
  'no-votes': 'No votes are reported.',
  early: `Fewer than ${EARLY_PCT}% of the expected vote is reported.`,
  competitive: 'The trailing candidate needs under 55% of the remaining vote to overtake.',
  close: 'The margin is under 0.5% of the vote. Provisional, cured and overseas ballots can still change it.',
  runoff: 'This state requires 50% to win outright. The leader is below 50%.',
  rcv: 'No candidate has 50% of first choices. Ranked-choice rounds will decide the race.',
  lean: 'The trailing candidate needs 55–65% of the remaining vote to overtake.',
  strong: 'The trailing candidate needs more than 65% of the remaining vote to overtake.',
  decided: 'The estimated remaining vote is smaller than the lead. This is an estimate, not a call.',
  called: 'civicAPI has marked a winner.',
}

export function sortByVotes<T extends { votes: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.votes - a.votes)
}

export function totalVotes(list: { votes: number }[]): number {
  return list.reduce((sum, c) => sum + c.votes, 0)
}

/**
 * Estimate the votes still to count per candidate. The total remaining is
 * anchored to the statewide reporting figure. Regions decide where that
 * remainder sits: each region with enough reporting contributes its own
 * remainder at its own shares, and the rest is split at statewide shares.
 */
function project(
  candidates: Candidate[],
  pct: number,
  regions: RegionResult[] | undefined,
): { remaining: Map<string, number>; estRemaining: number | null } {
  const remaining = new Map<string, number>(candidates.map((c) => [c.name, 0]))
  const counted = totalVotes(candidates)
  if (counted === 0 || pct <= 0) return { remaining, estRemaining: null }
  if (pct >= 100) return { remaining, estRemaining: 0 }

  const estRemaining = counted / (pct / 100) - counted

  const regional = new Map<string, number>(candidates.map((c) => [c.name, 0]))
  let regionalTotal = 0
  for (const region of regions ?? []) {
    const regionVotes = totalVotes(region.candidates)
    if (regionVotes === 0 || region.pct < MIN_REGION_PCT || region.pct >= 100) continue
    const regionRemaining = regionVotes / (region.pct / 100) - regionVotes
    regionalTotal += regionRemaining
    for (const c of region.candidates) {
      if (regional.has(c.name)) regional.set(c.name, regional.get(c.name)! + regionRemaining * (c.votes / regionVotes))
    }
  }

  // Scale regional estimates down if they exceed the statewide remainder.
  const scale = regionalTotal > estRemaining ? estRemaining / regionalTotal : 1
  const unexplained = Math.max(0, estRemaining - regionalTotal * scale)
  for (const c of candidates) {
    remaining.set(c.name, regional.get(c.name)! * scale + unexplained * (c.votes / counted))
  }
  return { remaining, estRemaining }
}

export function inferRace(
  candidates: Candidate[],
  pct: number,
  regions?: RegionResult[],
  rules: ElectionRules = NO_RULES,
): Inference {
  const sorted = sortByVotes(candidates)
  const leader = sorted[0] ?? null
  const runnerUp = sorted[1] ?? null
  const counted = totalVotes(sorted)
  const marginVotes = leader && runnerUp ? leader.votes - runnerUp.votes : (leader?.votes ?? 0)
  const marginShare = counted > 0 ? marginVotes / counted : 0
  const leaderShare = counted > 0 && leader ? leader.votes / counted : 0

  const { remaining, estRemaining } = project(sorted, pct, regions)
  const projectedRaw = sorted.map((c) => ({
    name: c.name,
    party: c.party,
    color: c.color,
    votes: c.votes + (remaining.get(c.name) ?? 0),
  }))
  const projectedTotal = totalVotes(projectedRaw)
  const projected = sortByVotes(projectedRaw).map((p) => ({
    ...p,
    share: projectedTotal > 0 ? p.votes / projectedTotal : 0,
  }))
  const projectionFlips = Boolean(leader && projected[0] && projected[0].name !== leader.name)

  let neededShare: number | null = null
  if (leader && runnerUp && estRemaining !== null) {
    neededShare = estRemaining > 0 ? (marginVotes + estRemaining) / (2 * estRemaining) : marginVotes > 0 ? Infinity : 0.5
  }

  // The status uses the statewide count only, so the race list and the race
  // page always agree. The county projection is reported separately.
  let status: InferenceStatus
  if (sorted.some((c) => c.winner)) status = 'called'
  else if (counted === 0) status = 'no-votes'
  else if (pct < EARLY_PCT) status = 'early'
  else if (rules.rcv && leaderShare < 0.5) status = 'rcv'
  else if (rules.majority && leaderShare < 0.5) status = 'runoff'
  else if (!runnerUp) status = 'decided'
  else if (neededShare === null || neededShare < 0.55) status = 'competitive'
  else if (neededShare > 1) status = marginShare < CLOSE_MARGIN ? 'close' : 'decided'
  else if (neededShare > 0.65) status = 'strong'
  else status = 'lean'

  return {
    status,
    leader,
    runnerUp,
    counted,
    estTotal: estRemaining === null ? null : counted + estRemaining,
    estRemaining,
    marginVotes,
    marginShare,
    leaderShare,
    neededShare,
    projected,
    projectionFlips,
  }
}

/** Fill opacity for map shading. */
export const STATUS_OPACITY: Record<InferenceStatus, number> = {
  called: 1,
  decided: 0.85,
  strong: 0.65,
  lean: 0.45,
  competitive: 0.28,
  close: 0.28,
  runoff: 0.28,
  rcv: 0.28,
  early: 0.18,
  'no-votes': 0,
}

/** Sort order for "closest first" lists. */
export const STATUS_RANK: Record<InferenceStatus, number> = {
  close: 0,
  competitive: 1,
  runoff: 2,
  rcv: 3,
  lean: 4,
  strong: 5,
  early: 6,
  decided: 7,
  called: 8,
  'no-votes': 9,
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function formatShare(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`
}
