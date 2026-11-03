import { describe, expect, it } from 'vitest'
import { inferRace } from '../shared/utils/inference'
import type { Candidate, RegionResult } from '../shared/types'

const cand = (name: string, votes: number, winner = false): Candidate => ({
  name,
  party: name,
  color: '#888',
  votes,
  winner,
})

const region = (key: string, pct: number, a: number, b: number): RegionResult => ({
  key,
  name: key,
  fips: null,
  pct,
  candidates: [cand('A', a), cand('B', b)],
})

describe('inferRace', () => {
  it('reports no votes', () => {
    expect(inferRace([cand('A', 0), cand('B', 0)], 0).status).toBe('no-votes')
  })

  it('reports too early under the threshold', () => {
    expect(inferRace([cand('A', 900), cand('B', 100)], 5).status).toBe('early')
  })

  it('passes through a civicAPI call', () => {
    expect(inferRace([cand('A', 10), cand('B', 9, true)], 3).status).toBe('called')
  })

  it('computes the share the runner-up needs', () => {
    // 50% in: 600 vs 400, est. 1000 remaining; B needs (200 + 1000) / 2000 = 60%.
    const inf = inferRace([cand('A', 600), cand('B', 400)], 50)
    expect(inf.estRemaining).toBeCloseTo(1000)
    expect(inf.neededShare).toBeCloseTo(0.6)
    expect(inf.status).toBe('lean')
  })

  it('marks a lead larger than the remaining vote as out of reach', () => {
    const inf = inferRace([cand('A', 7000), cand('B', 2000)], 90)
    expect(inf.neededShare).toBeGreaterThan(1)
    expect(inf.status).toBe('decided')
  })

  it('treats a full count without a call as out of reach', () => {
    expect(inferRace([cand('A', 501), cand('B', 499)], 100).status).toBe('decided')
  })

  it('flags a projection flip from unreported regions', () => {
    // Region X is done and favours A; region Y is 10% in and favours B heavily.
    const regions = [region('X', 100, 6000, 4000), region('Y', 10, 200, 800)]
    const inf = inferRace([cand('A', 6200), cand('B', 4800)], 52, regions)
    expect(inf.leader?.name).toBe('A')
    expect(inf.projected[0]?.name).toBe('B')
    expect(inf.projectionFlips).toBe(true)
    expect(inf.status).toBe('competitive')
  })
})
