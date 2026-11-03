/**
 * Freezes the results into static files so the site keeps working after
 * civicAPI moves on: public/archive/overview.json and
 * public/archive/race/<id>.json. Then build with ARCHIVE=1 so the pages read
 * those files and stop polling:
 *
 *   bun scripts/archive.ts [https://election-results.classicminidiy.workers.dev]
 *   ARCHIVE=1 bun run deploy
 *
 * Rerun before each archive deploy to capture late counts.
 */
const BASE = process.argv[2] ?? 'https://election-results.classicminidiy.workers.dev'
const UA = 'election-results-archiver (+https://github.com/SomethingNew71/election-results)'
const OUT = new URL('../public/archive/', import.meta.url)

async function get(path: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': UA, accept: 'application/json' } })
    if (res.ok) return res.json()
    if (attempt >= 3) throw new Error(`${path}: ${res.status}`)
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
  }
}

const overview = (await get('/api/overview')) as { stale: boolean; races: { id: number }[] }
if (overview.stale) throw new Error('civicAPI is serving stale data; try again later')
await Bun.write(new URL('overview.json', OUT), JSON.stringify(overview))

const queue = overview.races.map((r) => r.id)
let done = 0
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      await Bun.write(new URL(`race/${id}.json`, OUT), JSON.stringify(await get(`/api/race/${id}`)))
      if (++done % 50 === 0) console.log(`${done} of ${overview.races.length}`)
    }
  }),
)
console.log(`Archived ${done} races to public/archive/`)
