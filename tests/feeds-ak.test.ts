import { describe, expect, it } from 'vitest'
import { akKind, akName, parseAk, parseCsv } from '../server/feeds/ak'

const HEAD = 'Precinct_name,Reporting_flag,Pct_Id,Pct_seq_nbr,Reg_voters,Aggregation_ID,Contest_Id,Contest_seq_nbr,Contest_title,Contest_party_name,Selectable_Options,Candidate_State_ID,candidate_id,candidate_name,Candidate_Type,cand_seq_nbr,Party_Code,total_ballots,total_votes,total_under_votes,total_over_votes,'
const row = (pct: string, flag: number, title: string, name: string, votes: number) =>
  `"${pct} X",${flag},"${pct}",1,2235,"",6,5,"${title}",""` + `,1,"",524,"${name.replace(/"/g, '""')}",C,1,"REP",0,${votes},0,0,`

const CSV = [
  HEAD,
  row('01-600', 1, 'U.S. Senator', 'Peltola, Mary', 100),
  row('01-600', 1, 'U.S. Senator', 'Sullivan, Dan S.', 90),
  row('01-600', 1, 'U.S. Senator', 'Sullivan, Daniel J. Jr.', 2),
  row('01-601', 0, 'U.S. Senator', 'Peltola, Mary', 0),
  row('01-601', 0, 'U.S. Senator', 'Sullivan, Dan S.', 0),
  row('01-601', 0, 'U.S. Senator', 'Sullivan, Daniel J. Jr.', 0),
  row('01-600', 1, 'U.S. Representative', 'McDermott, James C. "Jim"', 4),
  row('01-600', 1, 'U.S. Representative', 'Begich, Nick', 80),
  row('01-600', 1, 'Governor / Lieutenant Governor', 'Bronson/Church', 30),
  row('01-600', 1, 'Governor / Lieutenant Governor', 'Kreiss-Tomkins/Johnson', 31),
  row('01-600', 1, 'Senate District A', 'Stedman, Bert K.', 5),
  row('01-600', 1, 'BM#2 24ESEG', 'YES', 5),
].join('\n')

describe('Alaska', () => {
  it('reads quoted CSV fields', () => {
    expect(parseCsv('a,"b ""c"", d",e\r\n1,2,3\n')).toEqual([['a', 'b "c", d', 'e'], ['1', '2', '3']])
  })

  it('names contests and candidates', () => {
    expect(akKind('U.S. Representative')).toEqual({ kind: 'house', district: 'AK-AL' })
    expect(akKind('Senate District A')).toBeNull()
    expect(akName('Sullivan, Daniel J. Jr.', false)).toBe('Daniel J. Jr. Sullivan')
    expect(akName('Bronson/Church', true)).toBe('Bronson / Church')
  })

  it('sums precincts and counts reporting ones', () => {
    const races = parseAk(CSV)
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['senate:null', 'house:AK-AL', 'governor:null'])
    expect(races[0]).toMatchObject({ state: 'AK', unitsReporting: 1, unitsTotal: 2, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Mary Peltola', votes: 100 },
      { name: 'Dan S. Sullivan', votes: 90 },
      { name: 'Daniel J. Jr. Sullivan', votes: 2 },
    ])
    expect(races[1]!.candidates[0]).toEqual({ name: 'James C. "Jim" McDermott', votes: 4 })
    expect(races[2]!.candidates.map((c) => c.name)).toEqual(['Bronson / Church', 'Kreiss-Tomkins / Johnson'])
  })
})
