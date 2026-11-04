/**
 * Writes server/data/race-seed.json: civicAPI's two race searches, cut down to
 * the fields toSummary reads. The Worker starts with this copy, so a deploy
 * during a civicAPI outage still shows the ballot and the state feeds' counts.
 * Run before a deploy: bun scripts/build-race-seed.ts
 */
const USER_AGENT = 'election-results-worker (+https://github.com/SomethingNew71/election-results)'
const ELECTION_DATE = '2026-11-03'

const scopes = ['General', 'Statewide'] as const
const fetchScope = async (scope: string) => {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`https://civicapi.org/api/v2/race/search?country=US&startDate=${ELECTION_DATE}&endDate=${ELECTION_DATE}&election_type=${scope}&limit=5000`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(25_000),
      })
      if (res.ok) return ((await res.json()) as { races: Record<string, unknown>[] }).races
      console.warn(scope, res.status)
    } catch (err) {
      console.warn(scope, String(err))
    }
    await new Promise((r) => setTimeout(r, 5_000))
  }
  throw new Error(`civicAPI did not answer for ${scope}`)
}
const pick = ({ id, type, province, district, election_name, election_type, percent_reporting, candidates }: Record<string, unknown>) => ({
  id,
  type,
  province,
  district,
  election_name,
  election_type,
  percent_reporting,
  candidates: (candidates as Record<string, unknown>[]).map(({ name, party, color, votes, seats, winner, incumbent }) => ({ name, party, color, votes, seats, winner, incumbent })),
})
const [general, statewide] = await Promise.all(scopes.map(fetchScope))
const seed = { capturedAt: new Date().toISOString(), General: general!.map(pick), Statewide: statewide!.map(pick) }
await Bun.write(new URL('../server/data/race-seed.json', import.meta.url), JSON.stringify(seed))
console.log(seed.capturedAt, seed.General.length, seed.Statewide.length)
