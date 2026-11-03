<script setup lang="ts">
import type { RaceSummary } from '#shared/types'
import type { Inference } from '#shared/utils/inference'
import { STATUS_LABEL, STATUS_OPACITY } from '#shared/utils/inference'

/**
 * Every House race as one square, grouped in a tile grid of states. Each
 * state cell holds its districts in order. Squares are all the same size, so
 * the grid shows seats, not land area. District lines are not drawn: several
 * states redrew them for 2026, and a square needs no geometry.
 */
const props = defineProps<{ items: { race: RaceSummary; inf: Inference }[] }>()

/** [column, row] in a 12 × 8 tile grid of states. */
const TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
}
const SQ = 10
const GAP = 1.5
const PER_ROW = 4
const LABEL_H = 13
/** Space between state cells, and the narrowest cell (wide enough for its label). */
const PAD = 6
const MIN_W = 18

/**
 * Each grid column is as wide as its widest state and each grid row as tall
 * as its tallest, so one-seat states take little room and squares stay large.
 */
const layout = computed(() => {
  const byState = new Map<string, { race: RaceSummary; inf: Inference }[]>()
  for (const item of props.items) {
    if (!TILES[item.race.state]) continue
    if (!byState.has(item.race.state)) byState.set(item.race.state, [])
    byState.get(item.race.state)!.push(item)
  }
  const colW = new Array(12).fill(0)
  const rowH = new Array(8).fill(0)
  for (const [state, list] of byState) {
    const [col, row] = TILES[state]!
    colW[col] = Math.max(colW[col], MIN_W, Math.min(list.length, PER_ROW) * (SQ + GAP))
    rowH[row] = Math.max(rowH[row], LABEL_H + Math.ceil(list.length / PER_ROW) * (SQ + GAP))
  }
  const colX = colW.reduce<number[]>((xs, w, i) => [...xs, (xs[i] ?? 0) + (w ? w + PAD : 0)], [0])
  const rowY = rowH.reduce<number[]>((ys, h, i) => [...ys, (ys[i] ?? 0) + (h ? h + PAD : 0)], [0])

  const cells = [...byState.entries()].map(([state, list]) => {
    const [col, row] = TILES[state]!
    const x = colX[col]!
    const y = rowY[row]!
    const sorted = [...list].sort((a, b) => (a.race.district ?? '').localeCompare(b.race.district ?? '', 'en', { numeric: true }))
    return {
      state,
      x,
      y,
      squares: sorted.map(({ race, inf }, i) => ({
        race,
        inf,
        x: x + (i % PER_ROW) * (SQ + GAP),
        y: y + LABEL_H + Math.floor(i / PER_ROW) * (SQ + GAP),
      })),
    }
  })
  return { cells, width: colX.at(-1)!, height: rowY.at(-1)! }
})

function title(race: RaceSummary, inf: Inference) {
  if (inf.status === 'no-votes') return `${race.district}: no votes yet`
  return `${race.district}: ${inf.leader?.name} (${inf.leader?.party}) — ${STATUS_LABEL[inf.status]}, ${formatPct(race)} reporting`
}
</script>

<template>
  <svg :viewBox="`-2 -2 ${layout.width + 4} ${layout.height + 4}`" class="h-auto w-full" role="group" aria-label="House districts by state">
    <defs>
      <pattern id="district-pending" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="var(--empty)" />
        <circle cx="2" cy="2" r="0.8" fill="var(--ink)" fill-opacity="0.6" />
      </pattern>
    </defs>
    <g v-for="cell in layout.cells" :key="cell.state">
      <text :x="cell.x" :y="cell.y + 9" class="num" font-size="10" fill="var(--muted)">{{ cell.state }}</text>
      <NuxtLink v-for="s in cell.squares" :key="s.race.id" :to="`/race/${s.race.id}`" :aria-label="title(s.race, s.inf)">
        <rect
          :x="s.x"
          :y="s.y"
          :width="SQ"
          :height="SQ"
          rx="1.5"
          fill="var(--panel)"
        />
        <rect
          :x="s.x"
          :y="s.y"
          :width="SQ"
          :height="SQ"
          rx="1.5"
          :fill="s.inf.status === 'no-votes' ? 'url(#district-pending)' : s.inf.leader!.color"
          :fill-opacity="s.inf.status === 'no-votes' ? 1 : Math.max(STATUS_OPACITY[s.inf.status], 0.18)"
          :stroke="s.inf.status === 'called' ? 'var(--ink)' : 'var(--map-line)'"
          :stroke-width="s.inf.status === 'called' ? 1.2 : 0.5"
          class="cursor-pointer hover:stroke-[var(--ink)]"
        >
          <title>{{ title(s.race, s.inf) }}</title>
        </rect>
      </NuxtLink>
    </g>
  </svg>
</template>
