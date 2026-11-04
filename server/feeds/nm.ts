import type { FeedRace, RaceKind } from '#shared/types'
import { USER_AGENT } from '../utils/civic'
import { countsFingerprint, type FeedAdapter } from './http'

/**
 * New Mexico Secretary of State election-night results (electionresults.sos.nm.gov).
 * The site publishes no JSON; its export is an ASP.NET postback. This reads the
 * server-rendered HTML of two pages: Federal (`type=FED`, about 85 KB: US Senate
 * and House) and Statewide (`type=SW`, about 215 KB: governor). The markup uses
 * fixed class names (`display-results-box-a` title, `-d` candidate, `-f` votes).
 * The page stamp is minute-resolution, so a fingerprint of the counts is the version.
 */
const BASE = 'https://electionresults.sos.nm.gov/resultsSW.aspx'
const PAGES = [`${BASE}?type=FED&map=CTY`, `${BASE}?type=SW&map=CTY`]

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
function text(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** The state prints names in capitals ("BEN R LUJAN"). Luján is spelled without the accent there. */
export function newMexicoName(raw: string): string {
  const s = text(raw)
  if (s !== s.toUpperCase()) return s
  return s
    .toLowerCase()
    .replace(/(^|[\s"(\-'])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (_, c: string) => 'Mc' + c.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bLujan$/, 'Luján')
}

export function newMexicoKind(title: string): { kind: RaceKind; district: string | null } | null {
  const t = text(title)
  if (/^United States Senator$/i.test(t)) return { kind: 'senate', district: null }
  if (/^Governor\b/i.test(t)) return { kind: 'governor', district: null }
  const m = t.match(/^United States Representative DISTRICT (\d+)$/i)
  return m ? { kind: 'house', district: `NM-${m[1]!.padStart(2, '0')}` } : null
}

export function parseNewMexico(pages: string[]): FeedRace[] {
  const races: FeedRace[] = []
  for (const html of pages) {
    const blocks = html.split('<div class="display-results-box-a">').slice(1)
    for (const block of blocks) {
      const title = block.match(/<h1>([^<]*)<\/h1>/)?.[1]
      const kind = title ? newMexicoKind(title) : null
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
        } else candidates.push({ name: newMexicoName(name!), votes: n })
      }
      if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIns })
      const precincts = block.match(/Precincts Fully:\s*([\d,]+)\s*\/\s*([\d,]+)/)
      races.push({
        state: 'NM',
        ...kind,
        candidates,
        unitsReporting: precincts ? Number(precincts[1]!.replace(/,/g, '')) : 0,
        unitsTotal: precincts ? Number(precincts[2]!.replace(/,/g, '')) : 0,
        unitLabel: 'precincts',
      })
    }
  }
  return races
}

export const nm: FeedAdapter = {
  state: 'NM',
  source: 'New Mexico Secretary of State',
  sourceUrl: 'https://electionresults.sos.nm.gov/',
  async load() {
    const pages = await Promise.all(
      PAGES.map(async (url) => {
        const res = await fetch(url, { headers: { accept: 'text/html', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
        if (!res.ok) throw new Error(`${this.source}: ${res.status} for ${url}`)
        const html = await res.text()
        // The site keeps older elections on the same address.
        if (!/id="hidElectionDate"[^>]*value="11\/3\/2026"/.test(html)) throw new Error(`${this.source}: page is not the 2026-11-03 election`)
        return html
      }),
    )
    const races = parseNewMexico(pages)
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
