import type { FeedRace, RaceKind } from '#shared/types'
import { USER_AGENT } from '../utils/civic'
import { countsFingerprint, type FeedAdapter } from './http'

/**
 * North Dakota Secretary of State results (results.sos.nd.gov). The site
 * publishes no JSON; its export is an ASP.NET postback. This reads the
 * server-rendered Statewide page (`ResultsSW.aspx?text=All&type=SW`, about 400 KB):
 * US Senate, US House (at large) and governor when they are on the ballot.
 * Class names are fixed (`display-results-box-a` title, `-d` candidate, `-g` votes).
 * The page keeps the 2024 election until the state loads the next one, so `load`
 * throws until `hidElectionDate` reads 11/3/2026. A fingerprint of the counts is the version.
 */
const URL = 'https://results.sos.nd.gov/ResultsSW.aspx?text=All&type=SW&map=CTY'

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
function text(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

export function northDakotaKind(title: string): { kind: RaceKind; district: string | null } | null {
  const t = text(title)
  if (/^United States Senator$/i.test(t)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(t)) return { kind: 'governor', district: null }
  if (/^Representative in Congress$/i.test(t)) return { kind: 'house', district: 'ND-AL' }
  return null
}

export function parseNorthDakota(html: string): FeedRace[] {
  const races: FeedRace[] = []
  for (const block of html.split('<div class="display-results-box-a">').slice(1)) {
    const title = block.match(/<h1>([^<]*)<\/h1>/)?.[1]
    const kind = title ? northDakotaKind(title) : null
    if (!kind) continue
    // Each candidate row: name in a `-d` cell, votes in the `-g` cell. The write-in row's name holds a "write-in" label.
    const rows = [...block.matchAll(/display-results-box-d"[^>]*>\s*<h2>([\s\S]*?)<\/h2>[\s\S]*?display-results-box-g"[^>]*>([^<]*)<\/h2>/g)]
    let writeIns = 0
    let hasWriteIn = false
    const candidates: { name: string; votes: number }[] = []
    for (const [, rawName, votes] of rows) {
      const name = text(rawName!)
      const n = Number(text(votes!).replace(/,/g, '')) || 0
      // The expandable write-in row repeats its label (open and closed state).
      if (/write[\s-]?in/i.test(name)) {
        hasWriteIn = true
        writeIns += n
      } else candidates.push({ name, votes: n })
    }
    if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIns })
    const precincts = block.match(/Precincts Fully:\s*([\d,]+)\s*\/\s*([\d,]+)/)
    races.push({
      state: 'ND',
      ...kind,
      candidates,
      unitsReporting: precincts ? Number(precincts[1]!.replace(/,/g, '')) : 0,
      unitsTotal: precincts ? Number(precincts[2]!.replace(/,/g, '')) : 0,
      unitLabel: 'precincts',
    })
  }
  return races
}

export const nd: FeedAdapter = {
  state: 'ND',
  source: 'North Dakota Secretary of State',
  sourceUrl: 'https://results.sos.nd.gov/',
  async load() {
    const res = await fetch(URL, { headers: { accept: 'text/html', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`${this.source}: ${res.status} for ${URL}`)
    const html = await res.text()
    if (!/id="hidElectionDate"[^>]*value="11\/3\/2026"/.test(html)) throw new Error(`${this.source}: page is not the 2026-11-03 election`)
    const races = parseNorthDakota(html)
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
