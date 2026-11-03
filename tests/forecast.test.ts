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
    expect(c.totals).toMatchObject({ dem: 0, rep: 0, unrated: 1 })
    expect(c.publishedTotals).toBeNull()
    expect(c.simulationIssues).toEqual([])
    expect(c.seats).toBeNull()
    expect(c.majorityThreshold).toBe(26)
    expect(c.probRep).toBeNull()
    expect(c.races[0]!.rating).toBe('Unrated')
    expect(parseForecast('house', 218, {}, ids).races).toEqual([])
  })

  it('counts seats by rating plus seats not up, as civicAPI\'s site does', () => {
    const c = parseForecast(
      'senate',
      51,
      {
        totals: { democrat: 62, republican: 59, tossup: 1, independent: 0 },
        states: { CO: { rating: 'Safe D' }, IA: { rating: 'Tossup' }, AL: { rating: 'Safe R' }, NE: { rating: 'Tilt I' } },
      },
      ids,
      { Democratic: 32, Independent: 2, Republican: 31 },
    )
    expect(c.totals).toEqual({ dem: 33, rep: 32, ind: 3, tossup: 1, unrated: 0, notUp: { dem: 32, rep: 31, ind: 2 } })
    expect(c.publishedTotals).toEqual({ dem: 62, rep: 59, tossup: 1, ind: 0 })
  })

  it('lists simulation figures that cannot all be true', () => {
    const broken = parseForecast(
      'senate',
      51,
      {
        monte_carlo: { prob_democrat_majority: 100, prob_republican_majority: 100, democrat_seats_p50: 63, republican_seats_p50: 63, expected_democrat_seats: 62.7, expected_republican_seats: 62.8 },
        distribution: { bins: [{ seats: 101, probability: 0 }] },
      },
      ids,
    )
    expect(broken.simulationIssues).toHaveLength(4)
    expect(broken.simulationIssues[0]).toContain('both parties a majority')
    const fine = parseForecast('house', 218, { monte_carlo: { prob_democrat_majority: 96, prob_republican_majority: 3.5, democrat_seats_p50: 240, republican_seats_p50: 195 } }, ids)
    expect(fine.simulationIssues).toEqual([])
  })
})
