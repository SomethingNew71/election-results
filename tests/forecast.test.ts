import { describe, expect, it } from 'vitest'
import { parseForecast } from '../server/utils/forecast'
import { ratingRank, ratingStyle } from '../shared/utils/forecast'
import { partyColor } from '../shared/utils/parties'

describe('forecast ratings', () => {
  it('maps a rating to a party and a strength', () => {
    expect(ratingStyle('Safe D')).toEqual({ party: 'Democratic', color: partyColor('Democratic'), opacity: 0.85 })
    expect(ratingStyle('Tilt R').party).toBe('Republican')
    expect(ratingStyle('Tilt R').opacity).toBeLessThan(ratingStyle('Lean R').opacity)
    expect(ratingStyle('Tossup').party).toBeNull()
    expect(ratingStyle('Something new').party).toBeNull()
  })

  it('orders ratings from D to R, unknown ones with toss-ups', () => {
    const sorted = ['Safe R', 'Tossup', 'Lean D', 'Safe D', 'Tilt R'].sort((a, b) => ratingRank(a) - ratingRank(b))
    expect(sorted).toEqual(['Safe D', 'Lean D', 'Tossup', 'Tilt R', 'Safe R'])
    expect(ratingRank('Unknown')).toBe(ratingRank('Tossup'))
  })
})

describe('parseForecast', () => {
  const ids = new Map([
    ['house|AK-AL', [101]],
    ['senate|OH', [201, 202]],
    ['senate|IA', [203]],
  ])

  it('keeps published units and links only unambiguous races', () => {
    const c = parseForecast(
      'senate',
      51,
      {
        last_updated: '2026-11-03',
        totals: { democrat: 62, republican: 59, tossup: 5, independent: 0 },
        states: {
          IA: { rating: 'Tossup', democrat_pct: 50.8, republican_pct: 49.2, independent_pct: 0, democratic: 'Josh Turek', republican: 'Ashley Hinson', independent: '' },
          OH: { rating: 'Tossup', democrat_pct: 55.6, republican_pct: 44.4, democratic: 'A', republican: 'B' },
          ID: { rating: 'Safe R', democrat_pct: 5.8, republican_pct: 92, independent_pct: 2.2, democratic: '', republican: 'Jim Risch', independent: '' },
        },
        monte_carlo: { prob_democrat_majority: 100, prob_republican_majority: 100, simulations: 65000, democrat_seats_p5: 59, democrat_seats_p50: 63, democrat_seats_p95: 66, republican_seats_p5: 59, republican_seats_p50: 63, republican_seats_p95: 67 },
        distribution: { bins: [{ seats: 62, probability: 17.42, control: 'democrat' }] },
        majority_odds: { rating: 'Safe D' },
      },
      ids,
    )
    expect([c.probDem, c.probRep]).toEqual([100, 100])
    expect(c.distribution[0]!.probability).toBe(17.42)
    expect(c.chamberRating).toBe('Safe D')
    expect(c.races.find((r) => r.key === 'IA')!.raceId).toBe(203)
    expect(c.races.find((r) => r.key === 'OH')!.raceId).toBeNull()
    const id = c.races.find((r) => r.key === 'ID')!
    expect(id.dem).toBe(5.8)
    expect(id.candidates.find((x) => x.party === 'Democratic')!.name).toBe('')
  })

  it('links House at-large seats', () => {
    const c = parseForecast('house', 218, { states: { 'AK-AL': { rating: 'Tilt R', republican_pct: 65.6 } } }, ids)
    expect(c.races[0]!.raceId).toBe(101)
    expect(c.races[0]!.dem).toBeNull()
  })

  it('survives a payload with fields missing', () => {
    const c = parseForecast('governor', 26, { states: { AK: { rating: null } }, monte_carlo: { prob_democrat_majority: 66.9 } }, ids)
    expect(c.totals).toBeNull()
    expect(c.seats).toBeNull()
    expect(c.majorityThreshold).toBe(26)
    expect(c.probRep).toBeNull()
    expect(c.races[0]!.rating).toBe('Unrated')
    expect(parseForecast('house', 218, {}, ids).races).toEqual([])
  })
})
