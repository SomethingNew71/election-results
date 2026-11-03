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

  it('never marks a sub-0.5% margin at 100% as out of reach', () => {
    expect(inferRace([cand('A', 501), cand('B', 499)], 100).status).toBe('close')
  })

  it('flags a projection flip without changing the status', () => {
    // Region X is done and favours A; region Y is 10% in and favours B heavily.
    const regions = [region('X', 100, 6000, 4000), region('Y', 10, 200, 800)]
    const inf = inferRace([cand('A', 6200), cand('B', 4800)], 52, regions)
    expect(inf.projected[0]?.name).toBe('B')
    expect(inf.projectionFlips).toBe(true)
    // Statewide only: est. 10,154 left, B needs (1400 + 10154) / 20308 = 56.9%.
    expect(inf.status).toBe('lean')
  })

  it('anchors the remaining vote to the statewide figure', () => {
    // A region at 1% would extrapolate to 100k votes; it must be ignored.
    const regions = [region('X', 1, 600, 400), region('Y', 50, 3000, 1000)]
    const inf = inferRace([cand('A', 3600), cand('B', 1400)], 50, regions)
    expect(inf.estRemaining).toBeCloseTo(5000)
    expect(inf.estTotal).toBeCloseTo(10000)
  })

  it('scales regional remainders that exceed the statewide remainder', () => {
    const regions = [region('X', 10, 900, 100)]
    const inf = inferRace([cand('A', 900), cand('B', 100)], 90, regions)
    expect(inf.estRemaining).toBeCloseTo(1000 / 0.9 - 1000)
  })

  it('shows a possible runoff below 50% in a majority state', () => {
    const field = [cand('A', 35), cand('B', 15), cand('C', 14), cand('D', 12), cand('E', 12), cand('F', 12)]
    expect(inferRace(field, 95, undefined, { majority: true, rcv: false }).status).toBe('runoff')
  })

  it('shows a ranked-choice count below 50% in an RCV state', () => {
    const field = [cand('A', 48), cand('B', 45), cand('C', 7)]
    expect(inferRace(field, 99, undefined, { majority: false, rcv: true }).status).toBe('rcv')
  })

  it('treats a first-round majority in an RCV state normally', () => {
    const field = [cand('A', 700), cand('B', 250), cand('C', 50)]
    expect(inferRace(field, 95, undefined, { majority: false, rcv: true }).status).toBe('decided')
  })
})
