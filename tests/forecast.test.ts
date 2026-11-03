import { describe, expect, it } from 'vitest'
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
