import { describe, expect, it } from 'vitest'
import { parseDelaware } from '../server/feeds/delaware'
import { parseOhio } from '../server/feeds/ohio'
import { alignByName } from '../server/feeds/http'
import { parseTally, parseTallyBreakdown, stripPartyPrefix, tallyKind } from '../server/feeds/tally'
import { parseVirginia, parseVirginiaBreakdown, virginiaKind } from '../server/feeds/virginia'
import type { FeedRace } from '../shared/types'

const en = (text: string) => [{ languageId: 'en', text }]

describe('Ohio', () => {
  it('maps contests and folds write-ins', () => {
    const races = parseOhio(
      [
        {
          query: 'Representative to Congress',
          data: {
            contestList: [
              {
                name: 'Representative to Congress - District 07',
                candidatesRunning: [
                  { primaryCandidate: 'Max Miller', vCount: 10, isWriteIn: false },
                  { primaryCandidate: 'Brian Poindexter', vCount: 8, isWriteIn: false },
                  { primaryCandidate: 'Thahbia Asad', vCount: 1, isWriteIn: true },
                ],
              },
            ],
          },
        },
      ],
      { reporting: 5, total: 8834 },
    )
    expect(races[0]).toMatchObject({ state: 'OH', kind: 'house', district: 'OH-07', unitsReporting: 5, unitsTotal: 8834 })
    expect(races[0]!.candidates).toEqual([
      { name: 'Max Miller', votes: 10 },
      { name: 'Brian Poindexter', votes: 8 },
      { name: 'Write-in', votes: 1 },
    ])
  })
})

describe('Tally ENR', () => {
  it('names contests', () => {
    expect(tallyKind('AR', 'U.S. Senate')).toEqual({ kind: 'senate', district: null })
    expect(tallyKind('AR', 'U.S. Congress District 04')).toEqual({ kind: 'house', district: 'AR-04' })
    expect(tallyKind('MO', 'U.S. Representative District 1')).toEqual({ kind: 'house', district: 'MO-01' })
    expect(tallyKind('AR', 'Lieutenant Governor')).toBeNull()
    expect(stripPartyPrefix('REP Tom Cotton')).toBe('Tom Cotton')
  })

  it('joins choice ids to names and reads counties by FIPS', () => {
    const races = parseTally(
      'AR',
      [
        {
          versionID: 'v97',
          response: {
            contests: {
              c1: {
                contestID: 'c1',
                precinctsReporting: 3,
                totalPrecincts: 10,
                choices: [
                  { choiceID: 'a', totalVotes: 60 },
                  { choiceID: 'b', totalVotes: 40 },
                ],
                writeInChoices: [{ choiceID: 'w', totalVotes: 2 }],
                locations: {
                  '05001': {
                    precinctsReporting: 1,
                    totalPrecincts: 2,
                    choices: [
                      { choiceID: 'b', totalVotes: 4 },
                      { choiceID: 'a', totalVotes: 6 },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
      {
        c1: {
          contestName: 'U.S. Senate',
          choices: [
            { id: 'a', name: 'REP Tom Cotton', isWriteIn: false },
            { id: 'b', name: 'DEM Hallie Shoffner', isWriteIn: false },
          ],
        },
      },
    )
    expect(races[0]!.candidates).toEqual([
      { name: 'Tom Cotton', votes: 60 },
      { name: 'Hallie Shoffner', votes: 40 },
      { name: 'Write-in', votes: 2 },
    ])
    expect(races[0]!.regions).toEqual([{ name: '05001', fips: '05001', precinctsReporting: 1, precinctsTotal: 2, votes: [6, 4, 0] }])
  })
})

describe('Virginia', () => {
  it('names contests', () => {
    expect(virginiaKind('Member, House of Representatives (11th District)')).toEqual({ kind: 'house', district: 'VA-11' })
    expect(virginiaKind('Member, House of Delegates (20th District)')).toBeNull()
  })
  it('uses the newest asOf as the version', () => {
    const { version, races } = parseVirginia({
      ballotItems: [
        {
          name: en('Member, United States Senate'),
          reportingStatus: { reportingUnits: 2, totalUnits: 133, asOf: '2026-11-04T01:00:00Z' },
          summaryResults: {
            ballotOptions: [
              { name: en('Mark R. Warner'), voteCount: 5, isWriteIn: false },
              { name: en('Write-In'), voteCount: 1, isWriteIn: true },
            ],
          },
        },
      ],
    })
    expect(version).toBe(Date.parse('2026-11-04T01:00:00Z'))
    expect(races[0]!.candidates).toEqual([
      { name: 'Mark R. Warner', votes: 5 },
      { name: 'Write-in', votes: 1 },
    ])
  })
})

describe('Delaware', () => {
  it('groups candidate rows by office', () => {
    const races = parseDelaware([
      { office: 'U.S. Senator', candidate_name: 'CHRIS COONS', total_votes: '1,200' },
      { office: 'U.S. Senator', candidate_name: 'MICHAEL "DR. MIKE" KATZ', total_votes: '900' },
      { office: 'Representative In Congress', candidate_name: 'SARAH MCBRIDE', total_votes: '5' },
      { office: 'State Senator District 1', candidate_name: 'X', total_votes: '1' },
    ])
    expect(races.map((r) => [r.kind, r.district, r.candidates.length])).toEqual([
      ['senate', null, 2],
      ['house', 'DE-AL', 1],
    ])
    expect(races[0]!.candidates[0]!.votes).toBe(1200)
  })
})

describe('version fingerprints', () => {
  it('changes when a correction lowers a count', async () => {
    const { countsFingerprint } = await import('../server/feeds/http')
    const race = (votes: number) => [{ state: 'OH', kind: 'senate', district: null, candidates: [{ name: 'A', votes }] }]
    expect(countsFingerprint(race(100))).not.toBe(countsFingerprint(race(95)))
    expect(countsFingerprint(race(100))).toBe(countsFingerprint(race(100)))
  })
})

describe('vote types', () => {
  const race = (names: string[]): FeedRace => ({
    state: 'XX',
    kind: 'senate',
    district: null,
    candidates: names.map((name) => ({ name, votes: 0 })),
    unitsReporting: 0,
    unitsTotal: 0,
    unitLabel: '',
  })

  it('lines rows up by name and sums write-ins', () => {
    const rows = [
      { name: 'B', writeIn: false, votes: [3, 4] },
      { name: 'A', writeIn: false, votes: [1, 2] },
      { name: 'x', writeIn: true, votes: [1, 0] },
      { name: 'y', writeIn: true, votes: [0, 5] },
    ]
    expect(alignByName([{ name: 'A' }, { name: 'B' }, { name: 'Write-in' }], rows, 2)).toEqual([[1, 2], [3, 4], [1, 5]])
    expect(alignByName([{ name: 'A' }, { name: 'C' }], rows, 2)).toBeNull()
  })

  it('reads Delaware columns in candidate order', () => {
    const [r] = parseDelaware([
      { office: 'U.S. Senator', candidate_name: 'A', total_votes: '1,010', machine_votes: '1,000', early_votes: '7', absentee_votes: '3' },
      { office: 'U.S. Senator', candidate_name: 'B', total_votes: '20', machine_votes: '10', early_votes: '5', absentee_votes: '5' },
    ])
    expect(r!.byType).toEqual({ types: ['Machine', 'Early', 'Absentee'], votes: [[1000, 7, 3], [10, 5, 5]] })
    expect(parseDelaware([{ office: 'U.S. Senator', candidate_name: 'A', total_votes: '1' }])[0]!.byType).toBeUndefined()
  })

  it('reads Virginia vote groups', () => {
    const g = (name: string, voteCount: number) => ({ groupName: en(name), voteCount })
    const split = parseVirginiaBreakdown(race(['A', 'B', 'Write-in']), {
      ballotItemWithBreakdown: {
        summaryResults: {
          ballotOptions: [
            { name: en('A'), isWriteIn: false, groupResults: [g('Early Voting', 5), g('Election Day', 6)] },
            { name: en('B'), isWriteIn: false, groupResults: [g('Election Day', 9), g('Early Voting', 1)] },
            { name: en('Write In'), isWriteIn: true, groupResults: [g('Early Voting', 1), g('Election Day', 0)] },
          ],
        },
      },
    })
    expect(split).toEqual({ types: ['Early Voting', 'Election Day'], votes: [[5, 6], [1, 9], [1, 0]] })
    expect(parseVirginiaBreakdown(race(['A']), { ballotItemWithBreakdown: null })).toBeNull()
  })

  it('reads Tally vote buckets with names from the election info', () => {
    const v = (a: number, b: number) => [
      { voteTypeID: 't1', votes: a },
      { voteTypeID: 't2', votes: b },
    ]
    const split = parseTallyBreakdown(
      race(['Tom Cotton', 'Jane Doe', 'Write-in']),
      { response: { choices: [{ choiceID: 'c2', votes: v(4, 5) }, { choiceID: 'c1', votes: v(1, 2) }], writeinChoices: [{ choiceID: 'w', votes: v(0, 1) }] } },
      {
        contestName: 'U.S. Senate',
        choices: [
          { id: 'c1', name: 'REP Tom Cotton', isWriteIn: false },
          { id: 'c2', name: 'DEM Jane Doe', isWriteIn: false },
        ],
      },
      new Map([
        ['t1', 'Absentee'],
        ['t2', 'Election Day'],
      ]),
    )
    expect(split).toEqual({ types: ['Absentee', 'Election Day'], votes: [[1, 2], [4, 5], [0, 1]] })
  })

  it('gives no split when the feed has one vote type', () => {
    const split = parseTallyBreakdown(
      race(['A']),
      { response: { choices: [{ choiceID: 'c1', votes: [{ voteTypeID: 't1', votes: 3 }] }] } },
      { contestName: 'U.S. Senate', choices: [{ id: 'c1', name: 'A', isWriteIn: false }] },
      new Map(),
    )
    expect(split).toBeNull()
  })
})
