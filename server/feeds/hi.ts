import type { FeedRace, RaceKind } from '#shared/types'
import { countsFingerprint, type FeedAdapter } from './http'
import { USER_AGENT } from '../utils/civic'

/**
 * Hawaii Office of Elections text file "Statewide Summary" (tab-separated, one
 * row per candidate, about 30 KB). The file's URL is not fixed: until results
 * start, the results page links a placeholder, so the adapter reads the
 * General Election block of https://elections.hawaii.gov/election-results/
 * (about 190 KB) for the "Text Files > Statewide Summary" link, then fetches it.
 * Two requests. The placeholder ("Information will be posted at a later date.")
 * throws, so the feed is skipped until real results exist.
 * Hawaii has no US Senate race in 2026.
 */
const PAGE = 'https://elections.hawaii.gov/election-results/'

const ROMAN: Record<string, number> = { I: 1, II: 2 }

export function hiKind(title: string): { kind: RaceKind; district: string | null } | null {
  const t = title.trim()
  if (/^Governor\b/i.test(t)) return { kind: 'governor', district: null }
  if (/^U\.S\. Senator$/i.test(t)) return { kind: 'senate', district: null }
  const m = t.match(/^U\.S\. Representative, Dist (I{1,2}|\d+)$/i)
  if (!m) return null
  const n = ROMAN[m[1]!.toUpperCase()] ?? Number(m[1])
  return { kind: 'house', district: `HI-${String(n).padStart(2, '0')}` }
}

/** "AWA, Brenton" → "Brenton Awa"; "KEOHOKALOLE, Jarrett K." → "Jarrett K. Keohokalole". */
export function hiName(raw: string): string {
  const i = raw.indexOf(',')
  if (i < 0) return raw.trim()
  const last = raw
    .slice(0, i)
    .trim()
    .split(/(?<=[\s'-])/)
    .map((w) => (w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join('')
  return `${raw.slice(i + 1).trim()} ${last}`
}

/** Finds the General Election "Statewide Summary" text file link on the results page. */
export function hiSummaryUrl(html: string): string | null {
  const start = html.indexOf('<h4>General Election</h4>')
  if (start < 0) return null
  const next = html.indexOf('<h4>', start + 5)
  const block = html.slice(start, next < 0 ? undefined : next)
  const m = block.match(/href="([^"]*summary\.txt)"/i)
  return m ? m[1]!.replace(/ /g, '%20') : null
}

export function parseHi(text: string): FeedRace[] {
  const lines = text.split(/\r?\n/)
  if (!lines.some((l) => l.startsWith('#Contest ID'))) throw new Error('Hawaii: summary file not published')
  const byKey = new Map<string, { race: FeedRace; extra: number }>()
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const c = line.split('\t').map((s) => s.trim().replace(/^"(.*)"$/, '$1'))
    const kind = hiKind(c[1] ?? '')
    if (!kind) continue
    const key = `${kind.kind}|${kind.district}`
    let e = byKey.get(key)
    if (!e) {
      e = {
        race: {
          state: 'HI',
          ...kind,
          candidates: [],
          unitsReporting: Number(c[13]) || 0,
          unitsTotal: Number(c[12]) || 0,
          unitLabel: 'precincts',
        },
        extra: 0,
      }
      byKey.set(key, e)
    }
    const raw = c[15] ?? ''
    const votes = Number(c[20]) || 0
    if (/write[\s-]?in/i.test(raw)) e.extra += votes
    else e.race.candidates.push({ name: hiName(raw), votes })
  }
  return [...byKey.values()].map((e) => {
    if (e.extra) e.race.candidates.push({ name: 'Write-in', votes: e.extra })
    return e.race
  })
}

async function getText(url: string, source: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`${source}: ${res.status} for ${url}`)
  return res.text()
}

export const hi: FeedAdapter = {
  state: 'HI',
  source: 'Hawaii Office of Elections',
  sourceUrl: PAGE,
  async load() {
    const url = hiSummaryUrl(await getText(PAGE, this.source))
    if (!url) throw new Error(`${this.source}: no General Election summary link`)
    const races = parseHi(await getText(url, this.source))
    if (!races.length) throw new Error(`${this.source}: no contests found`)
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
