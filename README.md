# Election Night Results

Live, nonpartisan US election results for the November 3, 2026 general election: Senate, House and Governor races on state and county maps, with transparent arithmetic inferences from the reported count.

- No ratings, endorsements or race calls of our own. "Called" only reflects a winner flag from civicAPI.
- Every other status is computed from the published count: the share of the remaining vote the trailing candidate needs to overtake, and a projection that splits each county's uncounted vote like its counted vote.

## Stack

Nuxt 4 + Tailwind CSS 4 on Cloudflare Workers (`cloudflare_module` preset). Maps use `d3-geo` and `us-atlas` (pre-projected Albers TopoJSON in `public/geo/`).

The Worker proxies civicAPI (`server/api/`) with a 20-second per-isolate cache and request coalescing. The browser refreshes every 30 seconds while the tab is visible.

## Develop

```bash
bun install
bun run dev
bun run test
```

## Deploy

```bash
bun run deploy
```

## Inference model

See `shared/utils/inference.ts`. Statuses:

| Status | Rule |
|---|---|
| Too early | Under 10% reporting |
| Competitive | Runner-up needs under 55% of the remaining two-way vote, or the county projection puts a different candidate ahead |
| Lean | Needs 55–65% |
| Strong lead | Needs over 65% |
| Out of reach (est.) | The lead is larger than the estimated remaining vote |
| Called | civicAPI marked a winner |

Remaining vote is estimated from `percent_reporting`, which civicAPI publishes as a whole number. Counting order (mail, early, Election Day) can move results in either direction.

## Data

Results: [civicAPI](https://civicapi.org) (free, attribution required). Map geometry: US Census Bureau via [us-atlas](https://github.com/topojson/us-atlas).
