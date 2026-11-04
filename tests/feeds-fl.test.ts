import { describe, expect, it } from 'vitest'
import { flKind, parseFl } from '../server/feeds/fl'

// Trimmed from the live file (Hillsborough, Pasco, and Alachua for Governor), 2026-11-03 20:10 ET.
const SAMPLE = [
  'ElectionDate\tPartyCode\tPartyName\tRaceCode\tRaceName\tCountyCode\tCountyName\tJuris1num\tJuris2num\tPrecincts\tPrecinctsReporting\tCanNameLast\tCanNameFirst\tCanNameMiddle\tCanVotes',
  '11/03/2026\tREP\tRepublican Party\tUSS\tUnited States Senator\tHIL\tHillsborough\t   \t \t446\t419\tMoody\tAshley\t\t226707',
  '11/03/2026\tREP\tRepublican Party\tUSS\tUnited States Senator\tPAS\tPasco\t   \t \t122\t117\tMoody\tAshley\t\t131573',
  '11/03/2026\tDEM\tDemocratic Party\tUSS\tUnited States Senator\tHIL\tHillsborough\t   \t \t446\t419\tNixon\tAngie\t\t270892',
  '11/03/2026\tDEM\tDemocratic Party\tUSS\tUnited States Senator\tPAS\tPasco\t   \t \t122\t117\tNixon\tAngie\t\t97984',
  '11/03/2026\tNPA\tNo Party Affiliation\tUSS\tUnited States Senator\tHIL\tHillsborough\t   \t \t446\t419\tGillespie\tNeil\tJ.\t6015',
  '11/03/2026\tNPA\tNo Party Affiliation\tUSS\tUnited States Senator\tPAS\tPasco\t   \t \t122\t117\tGillespie\tNeil\tJ.\t3371',
  '11/03/2026\tREP\tRepublican Party\tUSR\tRepresentative in Congress, District 15\tHIL\tHillsborough\t015\t \t88\t82\tLee\tLaurel\t\t21943',
  '11/03/2026\tREP\tRepublican Party\tUSR\tRepresentative in Congress, District 15\tPAS\tPasco\t015\t \t38\t36\tLee\tLaurel\t\t35196',
  '11/03/2026\tDEM\tDemocratic Party\tUSR\tRepresentative in Congress, District 15\tHIL\tHillsborough\t015\t \t88\t82\tPeople\tRobert\t\t50785',
  '11/03/2026\tDEM\tDemocratic Party\tUSR\tRepresentative in Congress, District 15\tPAS\tPasco\t015\t \t38\t36\tPeople\tRobert\t\t32361',
  '11/03/2026\tWRI\tWrite-in\tUSR\tRepresentative in Congress, District 15\tHIL\tHillsborough\t015\t \t88\t82\tBoone\tAngie\t\t0',
  '11/03/2026\tWRI\tWrite-in\tUSR\tRepresentative in Congress, District 15\tPAS\tPasco\t015\t \t38\t36\tBoone\tAngie\t\t0',
  '11/03/2026\tREP\tRepublican Party\tGOV\tGovernor and Lieutenant Governor\tALA\tAlachua\t   \t \t63\t27\tAvila\tDonalds\t/\t25466',
  '11/03/2026\tWRI\tWrite-in\tGOV\tGovernor and Lieutenant Governor\tALA\tAlachua\t   \t \t63\t27\tNokovich\tAnderson\t/\t0',
  '11/03/2026\tWRI\tWrite-in\tGOV\tGovernor and Lieutenant Governor\tALA\tAlachua\t   \t \t63\t27\tAlaways\tMorris\t/\t0',
].join('\n')

describe('Florida', () => {
  it('maps race codes', () => {
    expect(flKind('USS', 'United States Senator')).toEqual({ kind: 'senate', district: null })
    expect(flKind('GOV', 'Governor and Lieutenant Governor')).toEqual({ kind: 'governor', district: null })
    expect(flKind('USR', 'Representative in Congress, District 5')).toEqual({ kind: 'house', district: 'FL-05' })
    expect(flKind('STR', 'State Representative, District 1')).toBeNull()
  })

  it('sums counties, counts precincts once per county, and folds write-ins', () => {
    const races = parseFl(SAMPLE)
    const senate = races.find((r) => r.kind === 'senate')!
    expect(senate.candidates).toEqual([
      { name: 'Ashley Moody', votes: 358280 },
      { name: 'Angie Nixon', votes: 368876 },
      { name: 'Neil J. Gillespie', votes: 9386 },
    ])
    expect(senate).toMatchObject({ unitsReporting: 536, unitsTotal: 568, unitLabel: 'precincts' })

    const house = races.find((r) => r.district === 'FL-15')!
    expect(house.candidates.map((c) => c.name)).toEqual(['Laurel Lee', 'Robert People', 'Write-in'])
    expect(house.candidates[2]!.votes).toBe(0)
    expect(house.unitsTotal).toBe(126)
  })

  it('uses the governor surname from CanNameFirst', () => {
    const gov = parseFl(SAMPLE).find((r) => r.kind === 'governor')!
    expect(gov.candidates).toEqual([
      { name: 'Donalds', votes: 25466 },
      { name: 'Write-in', votes: 0 },
    ])
  })

  it('rejects a file with unknown columns', () => {
    expect(() => parseFl('a\tb\n1\t2')).toThrow()
  })
})
