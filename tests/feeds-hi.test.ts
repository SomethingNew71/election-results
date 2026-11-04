import { describe, expect, it } from 'vitest'
import { hiKind, hiName, hiSummaryUrl, parseHi } from '../server/feeds/hi'

// Format of the state's own 2026 Primary summary.txt (the General file is not published yet).
const HEAD = '#Contest ID\tContest Title\tContest Seq Nbr\tContest Type\tContest Party\tMail Blank Votes\tIn-Person Blank Votes\tMail Over Votes\tIn-Person Over Votes\tMail Invalid Votes\tIn-Person Invalid Votes\tRegistered Voters\tTotal Precincts\tCounted Precincts\tCandidate ID\tCandidate Name\tCandidate Seq Nbr\tCandidate Party\tMail Votes\tIn-Person Votes\tTotal Votes'
const row = (title: string, total: number, counted: number, name: string, votes: number) =>
  ['336', `"${title}"`, '5', 'OF', 'N', '1416', '50', '2', '0', '3754', '106', '846543', total, counted, '2', `"${name}"`, '1', '', votes, 0, votes].join('\t')

const SAMPLE = [
  '#FormatVersion 1',
  HEAD,
  row('U.S. Representative, Dist II', 273, 100, 'AWA, Brenton', 1194),
  row('U.S. Representative, Dist II', 273, 100, 'TOKUDA, Jill N.', 1300),
  row('U.S. Representative, Dist I', 223, 100, 'KEOHOKALOLE, Jarrett K.', 40848),
  row('Governor', 494, 100, 'GREEN, Josh', 5),
  row('Governor', 494, 100, 'CORDERY, Gary', 4),
  row('Lieutenant Governor', 494, 100, 'X, Y', 1),
].join('\n')

describe('Hawaii', () => {
  it('names contests and candidates', () => {
    expect(hiKind('U.S. Representative, Dist I')).toEqual({ kind: 'house', district: 'HI-01' })
    expect(hiKind('U.S. Representative, Dist II')).toEqual({ kind: 'house', district: 'HI-02' })
    expect(hiKind('Lieutenant Governor')).toBeNull()
    expect(hiName('AWA, Brenton')).toBe('Brenton Awa')
    expect(hiName('KEOHOKALOLE, Jarrett K.')).toBe('Jarrett K. Keohokalole')
  })

  it('reads counts and precincts', () => {
    const races = parseHi(SAMPLE)
    expect(races.map((r) => r.district ?? r.kind)).toEqual(['HI-02', 'HI-01', 'governor'])
    expect(races[0]).toMatchObject({ state: 'HI', unitsReporting: 100, unitsTotal: 273, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Brenton Awa', votes: 1194 },
      { name: 'Jill N. Tokuda', votes: 1300 },
    ])
  })

  it('rejects the placeholder file', () => {
    expect(() => parseHi('Information will be posted at a later date.')).toThrow(/not published/)
  })

  it('finds the General Election link, not the Primary one', () => {
    const html =
      '<h4>General Election</h4><a href="https://elections.hawaii.gov/wp-content/results/Placeholders/summary.txt">Statewide Summary</a>' +
      '<h4>Primary Election</h4><a href="https://elections.hawaii.gov/wp-content/results/2026 Primary/summary.txt">Statewide Summary</a>'
    expect(hiSummaryUrl(html)).toBe('https://elections.hawaii.gov/wp-content/results/Placeholders/summary.txt')
  })
})
