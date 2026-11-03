# election-results

Live 2026 US election results on Cloudflare Workers (`election-results.classicminidiy.workers.dev`). Nuxt 4, Tailwind 4, d3-geo, civicAPI. Deploy with `bun run deploy`.

## Invariants

- **Neutrality.** The app never calls a race. Only civicAPI's `winner` flag shows as "Called". Every other status is labelled as an estimate. No ratings, no "flip"/"hold" language.
- **Party colours are ours, not civicAPI's.** civicAPI assigns colours per candidate (a second Republican can be yellow). `toCandidate` overwrites them with `partyColor()` from `shared/utils/parties.ts`. The seat bar keeps Democratic left and Republican right at all times.
- **Status uses the statewide count only.** `inferRace` status ignores the county projection so the list and the race page always agree. The projection flip is shown as a separate note.
- **Remaining vote is anchored statewide.** Regions only decide where the remainder sits; regional estimates are scaled down to the statewide remainder, and regions under 5% reporting are not extrapolated.
- **One region type per race.** Alaska returns boroughs, house districts and a "State" row; Maine returns counties and townships. `toRegions` keeps one type (`REGION_TYPE_PREFERENCE`) to avoid double counting.
- **Majority and RCV rules** live in `shared/utils/rules.ts` (GA/LA runoff; AK all races, ME federal races RCV). Below 50% these states never show "Out of reach".
- **Seats not on the ballot** come from the static table in `shared/utils/officeholders.ts`, not from civicAPI's national summaries (their `seats` may change during the night). The table also drives the "current officeholders" map toggle.
- **`/api/race/:id` proxies only races on today's ballot** (so arbitrary ids cannot fill the isolate cache). In dev, past races are allowed — `5861` is the finished 2025 VA governor race, useful for testing with real numbers.
- **Stale data is labelled.** `civicGet` serves an older copy for up to 10 minutes when civicAPI fails, with `stale: true`; the UI shows the data's age from `dataAsOf`, not the poll time.

## Gotchas

- A `import type { X } from '#shared/utils/foo'` in an SFC stops Nuxt auto-importing that module's values in the template (SSR 500 "Cannot read properties of undefined"). Import the values explicitly in that file.
- `bun run build` while `nuxt dev` runs corrupts the dev server's auto-imports; restart dev after a build.
- `vue-tsc` does not run against the installed TypeScript version; `nuxt typecheck` fails. Rely on `bun run build`, `bun run test` and a browser check.
- civicAPI attribution is required (footer link).
