import type { FeedRace, RaceKind } from '#shared/types'
import { USER_AGENT } from '../utils/civic'
import { countsFingerprint, type FeedAdapter } from './http'

/**
 * South Dakota Secretary of State election-night results (electionresults.sd.gov).
 * The site publishes no JSON; its export is an ASP.NET postback. This reads the
 * server-rendered HTML of the Statewide Races page (`type=SWR`, about 110 KB):
 * US Senate, US House (at large) and governor. The markup uses fixed class names
 * (`display-results-box-a` title, `-d` candidate, `-f` votes). A fingerprint of
 * the counts is the version.
 */
const URL = 'https://electionresults.sd.gov/resultsSW.aspx?type=SWR&map=CTY'

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
function text(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

export function southDakotaKind(title: string): { kind: RaceKind; district: string | null } | null {
  const t = text(title)
  if (/^United States Senator$/i.test(t)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(t)) return { kind: 'governor', district: null }
  if (/^United States Representative$/i.test(t)) return { kind: 'house', district: 'SD-AL' }
  return null
}

export function parseSouthDakota(html: string): FeedRace[] {
  const races: FeedRace[] = []
  for (const block of html.split('<div class="display-results-box-a">').slice(1)) {
    const title = block.match(/<h1>([^<]*)<\/h1>/)?.[1]
    const kind = title ? southDakotaKind(title) : null
    if (!kind) continue
    const rows = [...block.matchAll(/display-results-box-d">\s*<h1>([^<]*)<\/h1>[\s\S]*?display-results-box-f">\s*<h1>([^<]*)<\/h1>/g)]
    let writeIns = 0
    let hasWriteIn = false
    const candidates: { name: string; votes: number }[] = []
    for (const [, name, votes] of rows) {
      const n = Number(text(votes!).replace(/,/g, '')) || 0
      if (/write[\s-]?in/i.test(name!)) {
        hasWriteIn = true
        writeIns += n
      } else candidates.push({ name: text(name!), votes: n })
    }
    if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIns })
    const precincts = block.match(/Precincts Fully:\s*([\d,]+)\s*\/\s*([\d,]+)/)
    races.push({
      state: 'SD',
      ...kind,
      candidates,
      unitsReporting: precincts ? Number(precincts[1]!.replace(/,/g, '')) : 0,
      unitsTotal: precincts ? Number(precincts[2]!.replace(/,/g, '')) : 0,
      unitLabel: 'precincts',
    })
  }
  return races
}

export const sd: FeedAdapter = {
  state: 'SD',
  source: 'South Dakota Secretary of State',
  sourceUrl: 'https://electionresults.sd.gov/',
  async load() {
    const res = await fetch(URL, { headers: { accept: 'text/html', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`${this.source}: ${res.status} for ${URL}`)
    const html = await res.text()
    // The site keeps older elections on the same address.
    if (!/id="hidElectionDate"[^>]*value="11\/3\/2026"/.test(html)) throw new Error(`${this.source}: page is not the 2026-11-03 election`)
    const races = parseSouthDakota(html)
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
