import { describe, expect, it } from 'vitest'
import { formatShift, shiftVs2024, turnoutEstimate, type Baseline } from '../shared/utils/baseline'
import type { Candidate, RegionResult } from '../shared/types'

const c = (name: string, party: string, votes: number): Candidate => ({ name, party, color: '#888', votes, winner: false })
const region = (fips: string, pct: number, d: number, r: number): RegionResult => ({
  key: fips,
  name: fips,
  fips,
  pct,
  candidates: [c('Dee', 'Democratic', d), c('Arr', 'Republican', r)],
})

const baseline: Baseline = {
  '19001': [1000, 400, 600],
  '19002': [1000, 500, 500],
  '19003': [1000, 300, 700],
  '19004': [7000, 3500, 3500],
  '20001': [5000, 2500, 2500],
}

describe('turnoutEstimate', () => {
  it('expects unfinished counties to vote at the complete counties\' turnout ratio', () => {
    const regions = [region('19001', 100, 320, 480), region('19002', 100, 400, 400), region('19003', 100, 240, 560), region('19004', 50, 1000, 1000)]
    const est = turnoutEstimate([c('Dee', 'Democratic', 1960), c('Arr', 'Republican', 2440)], regions, baseline, '19')
    expect(est?.ratio).toBeCloseTo(0.8)
    // 19004: 7000 * 0.8 = 5600 expected, 2000 counted.
    expect(est?.estRemaining).toBeCloseTo(3600)
    expect(est?.completeCounties).toBe(3)
  })

  it('needs enough complete counties and coverage', () => {
    const few = [region('19001', 100, 320, 480), region('19002', 40, 1, 1), region('19003', 40, 1, 1), region('19004', 40, 1, 1)]
    expect(turnoutEstimate([c('Dee', 'Democratic', 1), c('Arr', 'Republican', 1)], few, baseline, '19')).toBeNull()
    const partial = [region('19001', 100, 1, 1), region('19002', 100, 1, 1), region('19003', 100, 1, 1)]
    expect(turnoutEstimate([c('Dee', 'Democratic', 1), c('Arr', 'Republican', 1)], partial, baseline, '19')).toBeNull()
  })
})

describe('shiftVs2024', () => {
  it('reports the margin change toward a party', () => {
    // 2024: 40-60 (R+20). Now 450-550 of 1000 (R+10): moved 10 points toward D.
    expect(shiftVs2024(region('19001', 100, 450, 550), baseline)).toBeCloseTo(0.1)
    expect(formatShift(0.1)).toBe('D +10.0')
    expect(formatShift(-0.023)).toBe('R +2.3')
  })
  it('skips counties with few votes or no baseline', () => {
    expect(shiftVs2024(region('19001', 100, 10, 20), baseline)).toBeNull()
    expect(shiftVs2024(region('99999', 100, 450, 550), baseline)).toBeNull()
  })
})
