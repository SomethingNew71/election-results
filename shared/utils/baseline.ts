import type { Candidate, RegionResult } from '../types'
import { LEFT_PARTY, RIGHT_PARTY } from './parties'

/**
 * 2024 presidential results per county, keyed by 5-digit FIPS:
 * [total votes, Democratic votes, Republican votes]. Built by
 * scripts/build-county-2024.ts into public/data/county-2024.json.
 */
export type Baseline = Record<string, [number, number, number]>

/** A county at or above this reporting level counts as complete. */
export const COMPLETE_PCT = 95
/** The model needs at least this many complete counties. */
export const MIN_COMPLETE = 3
/** Matched counties must hold this share of the state's 2024 vote. */
export const MIN_COVERAGE = 0.9
/** Counties with fewer votes than this get no shift figure. */
export const MIN_SHIFT_VOTES = 100

export interface TurnoutEstimate {
  /** 2026 votes as a share of 2024 votes in the complete counties. */
  ratio: number
  completeCounties: number
  estRemaining: number
  estTotal: number
  /** Share of the remaining two-way vote the runner-up needs, as in inferRace. */
  neededShare: number | null
}

/**
 * A second estimate of the votes left, independent of civicAPI's reporting %:
 * every county is expected to cast its 2024 vote times the turnout ratio seen
 * in counties that have finished counting. It is shown beside the main
 * estimate and never changes a race's status. Counties that finish first are
 * often small, so the ratio can be off; the page says so.
 */
export function turnoutEstimate(
  candidates: Candidate[],
  regions: RegionResult[],
  baseline: Baseline,
  stateFips: string,
): TurnoutEstimate | null {
  let stateBase = 0
  for (const [fips, row] of Object.entries(baseline)) if (fips.startsWith(stateFips)) stateBase += row[0]
  if (stateBase === 0) return null

  const matched = regions.filter((r) => r.fips && baseline[r.fips])
  const matchedBase = matched.reduce((n, r) => n + baseline[r.fips!]![0], 0)
  // Duplicate or partial matches (a House district's slice of a county) would overcount.
  if (new Set(matched.map((r) => r.fips)).size !== matched.length) return null
  if (matchedBase / stateBase < MIN_COVERAGE || matchedBase > stateBase) return null

  const votesIn = (r: RegionResult) => r.candidates.reduce((n, c) => n + c.votes, 0)
  const complete = matched.filter((r) => r.pct >= COMPLETE_PCT && votesIn(r) > 0)
  if (complete.length < MIN_COMPLETE) return null
  const ratio = complete.reduce((n, r) => n + votesIn(r), 0) / complete.reduce((n, r) => n + baseline[r.fips!]![0], 0)

  let estRemaining = 0
  for (const r of matched) {
    if (r.pct >= COMPLETE_PCT) continue
    estRemaining += Math.max(0, baseline[r.fips!]![0] * ratio - votesIn(r))
  }
  const counted = candidates.reduce((n, c) => n + c.votes, 0)
  const [leader, runnerUp] = [...candidates].sort((a, b) => b.votes - a.votes)
  const margin = leader && runnerUp ? leader.votes - runnerUp.votes : 0
  const neededShare =
    leader && runnerUp ? (estRemaining > 0 ? (margin + estRemaining) / (2 * estRemaining) : margin > 0 ? Infinity : 0.5) : null
  return { ratio, completeCounties: complete.length, estRemaining, estTotal: counted + estRemaining, neededShare }
}

/**
 * Change in the Democratic-minus-Republican margin, as a share of the vote,
 * from the 2024 presidential race to this race in one county. Positive means
 * the margin moved toward the Democratic candidate, negative toward the
 * Republican. Null when the county is not in the baseline, has too few votes,
 * or the race lacks a candidate of either party.
 */
export function shiftVs2024(region: RegionResult, baseline: Baseline): number | null {
  const base = region.fips ? baseline[region.fips] : undefined
  if (!base || base[0] === 0) return null
  const total = region.candidates.reduce((n, c) => n + c.votes, 0)
  if (total < MIN_SHIFT_VOTES) return null
  const left = region.candidates.filter((c) => c.party === LEFT_PARTY)
  const right = region.candidates.filter((c) => c.party === RIGHT_PARTY)
  if (left.length !== 1 || right.length !== 1) return null
  const now = (left[0]!.votes - right[0]!.votes) / total
  const then = (base[1] - base[2]) / base[0]
  return now - then
}

/** "D +3.1" or "R +2.0": points the margin moved, and toward which party. */
export function formatShift(shift: number): string {
  const pts = Math.abs(shift * 100).toFixed(1)
  if (pts === '0.0') return '0.0'
  return `${shift > 0 ? 'D' : 'R'} +${pts}`
}
