import type { Candidate, RegionResult } from '../types'

/**
 * Inference statuses, weakest to strongest. None of these is a race call.
 * "called" only reflects a winner flag published by civicAPI.
 */
export type InferenceStatus =
  | 'no-votes'
  | 'early'
  | 'competitive'
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
  /** Share of the remaining two-way vote the runner-up needs to overtake. */
  neededShare: number | null
  projected: ProjectedShare[]
  /** True when the county projection puts a different candidate ahead. */
  projectionFlips: boolean
}

/** Below this reporting level the count is too small to read. */
export const EARLY_PCT = 10

export const STATUS_LABEL: Record<InferenceStatus, string> = {
  'no-votes': 'No votes yet',
  early: 'Too early',
  competitive: 'Competitive',
  lean: 'Lean',
  strong: 'Strong lead',
  decided: 'Out of reach (est.)',
  called: 'Called',
}

export const STATUS_HELP: Record<InferenceStatus, string> = {
  'no-votes': 'No votes are reported.',
  early: `Fewer than ${EARLY_PCT}% of the expected vote is reported.`,
  competitive: 'The trailing candidate needs under 55% of the remaining vote to overtake.',
  lean: 'The trailing candidate needs 55–65% of the remaining vote to overtake.',
  strong: 'The trailing candidate needs more than 65% of the remaining vote to overtake.',
  decided:
    'The estimated remaining vote is smaller than the lead. This is an estimate, not a call.',
  called: 'civicAPI has marked a winner.',
}

export function sortByVotes<T extends { votes: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.votes - a.votes)
}

export function totalVotes(list: { votes: number }[]): number {
  return list.reduce((sum, c) => sum + c.votes, 0)
}

/**
 * Estimate the votes still to count. Each reporting region's remainder is
 * split by that region's current shares. The statewide remainder not
 * explained by reporting regions is split by the statewide shares.
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

  const estTotal = counted / (pct / 100)
  let explained = 0

  for (const region of regions ?? []) {
    const regionVotes = totalVotes(region.candidates)
    if (regionVotes === 0 || region.pct <= 0) continue
    const regionPct = Math.min(region.pct, 100)
    const regionRemaining = regionVotes / (regionPct / 100) - regionVotes
    explained += regionVotes + regionRemaining
    for (const c of region.candidates) {
      if (!remaining.has(c.name)) continue
      remaining.set(c.name, remaining.get(c.name)! + regionRemaining * (c.votes / regionVotes))
    }
  }

  const unexplained = Math.max(0, estTotal - (regions?.length ? explained : counted))
  for (const c of candidates) {
    remaining.set(c.name, remaining.get(c.name)! + unexplained * (c.votes / counted))
  }

  let estRemaining = 0
  for (const v of remaining.values()) estRemaining += v
  return { remaining, estRemaining }
}

export function inferRace(
  candidates: Candidate[],
  pct: number,
  regions?: RegionResult[],
): Inference {
  const sorted = sortByVotes(candidates)
  const leader = sorted[0] ?? null
  const runnerUp = sorted[1] ?? null
  const counted = totalVotes(sorted)
  const marginVotes = leader && runnerUp ? leader.votes - runnerUp.votes : (leader?.votes ?? 0)
  const marginShare = counted > 0 ? marginVotes / counted : 0

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

  const base = {
    leader,
    runnerUp,
    counted,
    estTotal: estRemaining === null ? null : counted + estRemaining,
    estRemaining,
    marginVotes,
    marginShare,
    neededShare,
    projected,
    projectionFlips,
  }

  let status: InferenceStatus
  if (sorted.some((c) => c.winner)) status = 'called'
  else if (counted === 0) status = 'no-votes'
  else if (pct < EARLY_PCT) status = 'early'
  else if (!runnerUp) status = 'decided'
  else if (projectionFlips || neededShare === null || neededShare < 0.55) status = 'competitive'
  else if (neededShare > 1) status = 'decided'
  else if (neededShare > 0.65) status = 'strong'
  else status = 'lean'

  return { status, ...base }
}

/** Fill opacity for map shading, strongest status first. */
export const STATUS_OPACITY: Record<InferenceStatus, number> = {
  called: 1,
  decided: 0.85,
  strong: 0.65,
  lean: 0.45,
  competitive: 0.28,
  early: 0.18,
  'no-votes': 0,
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function formatShare(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`
}
