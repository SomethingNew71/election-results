/**
 * Election-night health check for the live site. Prints data age, status
 * counts and, per state feed, how many races matched and how many show the
 * state's counts. Exits 1 when something needs a look:
 *   - civicAPI data is stale or over 2 minutes old
 *   - a state feed that loaded before now has no races (format change?)
 *   - a race with votes failed to match its state feed
 *
 *   bun scripts/watch.ts [base-url]
 */
const BASE = process.argv[2] ?? 'https://election-results.classicminidiy.workers.dev'
const FEED_STATES = ['AR', 'CO', 'DE', 'IA', 'MO', 'OH', 'VA']

type Race = {
  id: number
  state: string
  kind: string
  district: string | null
  pct: number
  candidates: { name: string; votes: number; winner: boolean }[]
  crossCheck?: { matched: boolean; used: boolean; feedTotal: number; civicTotal: number; checkedAt: string; source: string }
}
const res = await fetch(`${BASE}/api/overview`, { headers: { 'user-agent': 'election-results-watch' } })
if (!res.ok) {
  console.log(`FAIL /api/overview ${res.status}`)
  process.exit(1)
}
const data = (await res.json()) as { dataAsOf: string; stale: boolean; races: Race[] }
const problems: string[] = []
const age = Math.round((Date.now() - Date.parse(data.dataAsOf)) / 1000)
console.log(`civicAPI data ${age}s old${data.stale ? ' (STALE)' : ''}; ${data.races.length} races`)
if (data.stale || age > 120) problems.push(`civicAPI data is ${age}s old${data.stale ? ' and stale' : ''}`)

const votes = (r: Race) => r.candidates.reduce((n, c) => n + c.votes, 0)
const withVotes = data.races.filter((r) => votes(r) > 0)
const called = data.races.filter((r) => r.candidates.some((c) => c.winner))
console.log(`${withVotes.length} races with votes; ${called.length} called by civicAPI`)

for (const state of FEED_STATES) {
  const races = data.races.filter((r) => r.state === state && r.crossCheck)
  const matched = races.filter((r) => r.crossCheck!.matched)
  const used = races.filter((r) => r.crossCheck!.used)
  const checked = races[0]?.crossCheck?.checkedAt
  const checkedAge = checked ? `${Math.round((Date.now() - Date.parse(checked)) / 1000)}s ago` : 'never'
  const feedVotes = races.reduce((n, r) => n + r.crossCheck!.feedTotal, 0)
  console.log(
    `${state}: ${matched.length}/${races.length} matched, ${used.length} showing state counts, state votes ${feedVotes.toLocaleString()}, checked ${checkedAge}`,
  )
  if (!races.length) problems.push(`${state}: no cross-checked races (feed down or format changed)`)
  for (const r of races.filter((x) => !x.crossCheck!.matched && votes(x) > 0)) {
    problems.push(`${state} ${r.district ?? r.kind}: did not match the state feed (race ${r.id})`)
  }
  if (checked && Date.now() - Date.parse(checked) > 5 * 60_000) problems.push(`${state}: feed not checked for ${checkedAge}`)
}

if (problems.length) {
  console.log(`\nNEEDS A LOOK (${problems.length}):`)
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nOK')
