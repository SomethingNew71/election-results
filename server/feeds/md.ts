import type { FeedRace } from '#shared/types'
import { USER_AGENT } from '../utils/civic'
import { countsFingerprint, type FeedAdapter } from './http'

/**
 * Maryland State Board of Elections unofficial results (static HTML pages
 * under elections.maryland.gov/elections/2026/general_Results/). The state
 * publishes no JSON or CSV for election night. One page lists the governor
 * and one lists all eight House districts, so a load makes 2 requests (about
 * 50 KB). The page has no machine version, so a fingerprint of the counts
 * stands in. Maryland has no US Senate race in 2026. Vote types are the
 * state's columns (Early Voting, Election Day, Mail-In Ballot, Provisional).
 */
const BASE = 'https://elections.maryland.gov/elections/2026/general_Results'
const GOVERNOR_URL = `${BASE}/gen_results_2026_1.html`
const HOUSE_URL = `${BASE}/gen_results_2026_4.html`

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** "NR" (not reported) and blanks count as 0. */
const count = (s: string) => Number(clean(s).replace(/,/g, '')) || 0

/** One results table (a segment of the page that holds one contest). */
function parseTable(segment: string, state: string, kind: 'governor' | 'house', district: string | null): FeedRace | null {
  const table = segment.match(/<table[\s\S]*?<\/table>/i)?.[0]
  if (!table) return null
  const types = [...(table.match(/<thead>[\s\S]*?<\/thead>/i)?.[0] ?? '').matchAll(/<th class="alignRight"[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((m) => clean(m[1]!))
    .filter((t) => !/^(total|percentage)$/i.test(t))
  const candidates: { name: string; votes: number }[] = []
  const typeVotes: number[][] = []
  let writeIn: { votes: number; byType: number[] } | null = null
  for (const row of table.match(/<tr>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
    if (cells.length < 4) continue
    const name = clean(cells[0]![2]!)
    if (!name || /^totals?$/i.test(name)) continue
    const nums = cells.filter((c) => /alignRight/.test(c[1]!)).map((c) => count(c[2]!))
    // The numeric cells are the vote types, then Total, then Percentage.
    const split = nums.slice(0, types.length)
    const total = nums[types.length] ?? 0
    if (/write[\s-]?in/i.test(name)) {
      writeIn ??= { votes: 0, byType: types.map(() => 0) }
      writeIn.votes += total
      split.forEach((v, i) => (writeIn!.byType[i]! += v))
      continue
    }
    // A governor ticket is "Name and Running Mate"; the feed keys on the first person.
    candidates.push({ name: name.split(/\s+and\s+/i)[0]!.trim(), votes: total })
    typeVotes.push(split)
  }
  if (!candidates.length) return null
  if (writeIn) {
    candidates.push({ name: 'Write-in', votes: writeIn.votes })
    typeVotes.push(writeIn.byType)
  }
  const prec = segment.match(/\((\d[\d,]*) of (\d[\d,]*) election day precincts reported\)/i)
  return {
    state,
    kind,
    district,
    candidates,
    unitsReporting: prec ? count(prec[1]!) : 0,
    unitsTotal: prec ? count(prec[2]!) : 0,
    unitLabel: 'election day precincts',
    ...(types.length ? { byType: { types, votes: typeVotes } } : {}),
  }
}

/** Governor page → one race. */
export function parseMarylandGovernor(html: string): FeedRace[] {
  const race = parseTable(html, 'MD', 'governor', null)
  return race ? [race] : []
}

/** Congress page → one race per `<h3>District N</h3>` block. */
export function parseMarylandHouse(html: string): FeedRace[] {
  const parts = html.split(/<h3>\s*District (\d+)\s*<\/h3>/i)
  const out: FeedRace[] = []
  // parts: [before, "1", block1, "2", block2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const race = parseTable(parts[i + 1]!, 'MD', 'house', `MD-${parts[i]!.padStart(2, '0')}`)
    if (race) out.push(race)
  }
  return out
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: 'text/html', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`Maryland State Board of Elections: ${res.status} for ${url}`)
  return res.text()
}

export const md: FeedAdapter = {
  state: 'MD',
  source: 'Maryland State Board of Elections',
  sourceUrl: 'https://elections.maryland.gov/elections/2026/general_Results/',
  async load() {
    const [gov, house] = await Promise.all([getHtml(GOVERNOR_URL), getHtml(HOUSE_URL)])
    const races = [...parseMarylandGovernor(gov), ...parseMarylandHouse(house)]
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
