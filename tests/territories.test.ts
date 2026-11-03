import { describe, expect, it, vi } from 'vitest'
import { partyColor } from '../shared/utils/parties'
import { rulesFor } from '../shared/utils/rules'
import { stateName } from '../shared/utils/states'

// civic.ts uses Nuxt's auto-import of partyColor.
vi.stubGlobal('partyColor', partyColor)
const { kindOf, toSummary } = await import('../server/utils/civic')

const race = (type: string, province: string, district: string | null) => ({
  id: 1,
  type,
  province,
  district,
  election_name: `${province} ${type}`,
  election_type: 'General',
  percent_reporting: 0,
  candidates: [],
})

describe('territories', () => {
  it('lists delegates with the House and flags them', () => {
    expect(kindOf('Delegate')).toBe('house')
    expect(toSummary(race('Delegate', 'GU', 'GU-AL'), 'house').delegate).toBe(true)
    expect(toSummary(race('House of Representatives', 'TX', 'TX-20'), 'house').delegate).toBeUndefined()
    expect(kindOf('Shadow Representative')).toBeNull()
  })

  it('names territories', () => {
    expect(stateName('GU')).toBe('Guam')
    expect(stateName('VI')).toBe('U.S. Virgin Islands')
    expect(stateName('DC')).toBe('District of Columbia')
  })

  it('applies territory runoff rules per office', () => {
    for (const t of ['GU', 'VI', 'MP']) expect(rulesFor(t, 'governor').majority).toBe(true)
    for (const t of ['GU', 'VI', 'AS']) expect(rulesFor(t, 'house').majority).toBe(true)
    expect(rulesFor('MP', 'house').majority).toBe(false)
    expect(rulesFor('DC', 'house').majority).toBe(false)
    expect(rulesFor('TX', 'house').majority).toBe(false)
  })
})
