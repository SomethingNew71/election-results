import type { FeedRace, RaceKind } from '#shared/types'
import { countsFingerprint, type FeedAdapter } from './http'
import { USER_AGENT } from '../utils/civic'

/**
 * Alaska Division of Elections ENR: one precinct-level CSV for the whole state
 * (about 3 MB, one request). Statewide totals are summed from the precinct
 * rows; a precinct counts as reporting when its `Reporting_flag` is 1.
 * Alaska candidates are listed "Last, First"; governor rows are tickets
 * ("Bronson/Church"), kept as "Bronson / Church" so the first person keys the match.
 */
const URL = 'https://www.elections.alaska.gov/enr/26GENR/results/GA_ENR_Precinct_State_of_Alaska.csv'

export function akKind(title: string): { kind: RaceKind; district: string | null } | null {
  if (/^U\.S\. Senator$/i.test(title)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(title)) return { kind: 'governor', district: null }
  if (/^U\.S\. Representative$/i.test(title)) return { kind: 'house', district: 'AK-AL' }
  return null
}

/** Minimal CSV reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function akName(raw: string, governor: boolean): string {
  if (governor) return raw.split('/').map((s) => s.trim()).join(' / ')
  const i = raw.indexOf(',')
  return i < 0 ? raw.trim() : `${raw.slice(i + 1).trim()} ${raw.slice(0, i).trim()}`
}

export function parseAk(csv: string): FeedRace[] {
  const rows = parseCsv(csv)
  const head = rows.shift() ?? []
  const col = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase())
  const [iPct, iFlag, iTitle, iName, iVotes] = ['Pct_Id', 'Reporting_flag', 'Contest_title', 'candidate_name', 'total_votes'].map(col) as [number, number, number, number, number]
  if ([iPct, iFlag, iTitle, iName, iVotes].some((i) => i < 0)) throw new Error('Alaska: unexpected CSV columns')

  const byKey = new Map<string, { race: FeedRace; votes: Map<string, number>; precincts: Map<string, boolean>; governor: boolean }>()
  for (const r of rows) {
    const kind = akKind(r[iTitle] ?? '')
    if (!kind) continue
    const key = `${kind.kind}|${kind.district}`
    let e = byKey.get(key)
    if (!e) {
      e = {
        race: { state: 'AK', ...kind, candidates: [], unitsReporting: 0, unitsTotal: 0, unitLabel: 'precincts' },
        votes: new Map(),
        precincts: new Map(),
        governor: kind.kind === 'governor',
      }
      byKey.set(key, e)
    }
    const name = r[iName]!
    e.votes.set(name, (e.votes.get(name) ?? 0) + (Number(r[iVotes]) || 0))
    if (r[iFlag] === '1') e.precincts.set(r[iPct]!, true)
    else if (!e.precincts.has(r[iPct]!)) e.precincts.set(r[iPct]!, false)
  }
  return [...byKey.values()].map((e) => {
    let writeIn = 0
    let hasWriteIn = false
    const candidates: { name: string; votes: number }[] = []
    for (const [raw, votes] of e.votes) {
      if (/write[\s-]?in/i.test(raw)) {
        hasWriteIn = true
        writeIn += votes
      } else candidates.push({ name: akName(raw, e.governor), votes })
    }
    if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIn })
    e.race.candidates = candidates
    e.race.unitsTotal = e.precincts.size
    e.race.unitsReporting = [...e.precincts.values()].filter(Boolean).length
    return e.race
  })
}

export const ak: FeedAdapter = {
  state: 'AK',
  source: 'Alaska Division of Elections',
  sourceUrl: 'https://www.elections.alaska.gov/election-results/e/?id=26genr',
  async load() {
    const res = await fetch(URL, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`${this.source}: ${res.status} for ${URL}`)
    const races = parseAk(await res.text())
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
