<script setup lang="ts">
import { geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, Geometry } from 'geojson'

export type StateFill =
  | { mode: 'result'; color: string; opacity: number; title: string }
  /** Race on the ballot with no readable result yet. */
  | { mode: 'pending'; title: string }
  /** No race; striped in the parties of the current officeholders. */
  | { mode: 'holder'; colors: string[]; title: string }

const props = defineProps<{
  fills: Record<string, StateFill>
  selected?: string | null
}>()
const emit = defineEmits<{ select: [postal: string] }>()

/** States too small to tap reliably on the map; they also get buttons below it. */
const SMALL_STATES = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC', 'HI']
/** States made of scattered islands get a bounding-box hit area so gaps are clickable. */
const BOX_HIT_STATES = new Set(['HI'])

type StatesTopo = Topology<{ states: GeometryCollection; nation: GeometryCollection }>
const topo = shallowRef<StatesTopo | null>(null)
onMounted(async () => {
  topo.value = await loadGeo<StatesTopo>('/geo/states-albers-10m.json')
})

const path = geoPath()
const shapes = computed(() => {
  if (!topo.value) return []
  const fc = feature(topo.value, topo.value.objects.states)
  return fc.features.map((f: Feature<Geometry, { name: string }>) => {
    const postal = STATE_BY_FIPS.get(String(f.id).padStart(2, '0'))?.postal ?? ''
    const [[x0, y0], [x1, y1]] = path.bounds(f)
    return { postal, name: f.properties.name, d: path(f) ?? '', box: { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 } }
  })
})
const lines = computed(() =>
  topo.value ? (path(mesh(topo.value, topo.value.objects.states)) ?? '') : '',
)

/** One stripe pattern per distinct colour set. */
const holderPatterns = computed(() => {
  const sets = new Map<string, string[]>()
  for (const fill of Object.values(props.fills)) {
    if (fill.mode === 'holder') sets.set(patternId(fill.colors), fill.colors)
  }
  return [...sets.entries()].map(([id, colors]) => ({ id, colors }))
})

function patternId(colors: string[]): string {
  return `holder-${colors.map((c) => c.replace('#', '')).join('-')}`
}

function fillFor(postal: string): { fill: string; opacity: number } {
  const f = props.fills[postal]
  if (!f) return { fill: 'var(--empty)', opacity: 0.5 }
  if (f.mode === 'pending') return { fill: 'url(#pending-dots)', opacity: 1 }
  if (f.mode === 'holder') return { fill: `url(#${patternId(f.colors)})`, opacity: 1 }
  return { fill: f.color, opacity: f.opacity }
}

const isSelectable = (postal: string) => Boolean(props.fills[postal]) && props.fills[postal]!.mode !== 'holder'
const labelFor = (postal: string) => props.fills[postal]?.title ?? `${stateName(postal)}: no race`

function select(postal: string) {
  if (isSelectable(postal)) emit('select', postal)
}

function onKey(e: KeyboardEvent, postal: string) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(postal)
  }
}

const hovered = ref<string | null>(null)
</script>

<template>
  <div>
    <svg viewBox="0 0 975 610" class="h-auto w-full" role="group" aria-label="Map of US states">
      <defs>
        <pattern id="pending-dots" width="7" height="7" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill="var(--empty)" />
          <circle cx="3.5" cy="3.5" r="1.2" fill="var(--ink)" fill-opacity="0.6" />
        </pattern>
        <pattern
          v-for="p in holderPatterns"
          :id="p.id"
          :key="p.id"
          :width="p.colors.length * 8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect :width="p.colors.length * 8" height="8" fill="var(--empty)" />
          <rect v-for="(c, i) in p.colors" :key="i" :x="i * 8" width="4" height="8" :fill="c" fill-opacity="0.75" />
        </pattern>
      </defs>
      <rect v-if="!topo" width="975" height="610" fill="var(--empty)" opacity="0.4" rx="8" />
      <g v-else>
        <path
          v-for="s in shapes"
          :key="s.postal"
          :d="s.d"
          :fill="fillFor(s.postal).fill"
          :fill-opacity="fillFor(s.postal).opacity"
          :class="isSelectable(s.postal) ? 'cursor-pointer outline-none' : 'outline-none'"
          :tabindex="isSelectable(s.postal) ? 0 : undefined"
          :role="isSelectable(s.postal) ? 'button' : undefined"
          :aria-label="labelFor(s.postal)"
          :aria-pressed="isSelectable(s.postal) ? selected === s.postal : undefined"
          @mouseenter="hovered = s.postal"
          @mouseleave="hovered = null"
          @focus="hovered = s.postal"
          @blur="hovered = null"
          @click="select(s.postal)"
          @keydown="onKey($event, s.postal)"
        >
          <title>{{ labelFor(s.postal) }}</title>
        </path>
        <path :d="lines" fill="none" stroke="var(--map-line)" stroke-width="0.9" stroke-linejoin="round" pointer-events="none" />
        <template v-for="s in shapes" :key="`hit-${s.postal}`">
          <rect
            v-if="BOX_HIT_STATES.has(s.postal) && isSelectable(s.postal)"
            :x="s.box.x"
            :y="s.box.y"
            :width="s.box.w"
            :height="s.box.h"
            fill="transparent"
            class="cursor-pointer"
            aria-hidden="true"
            @mouseenter="hovered = s.postal"
            @mouseleave="hovered = null"
            @click="select(s.postal)"
          />
        </template>
        <template v-for="s in shapes" :key="`sel-${s.postal}`">
          <path
            v-if="isSelectable(s.postal) && (selected === s.postal || hovered === s.postal)"
            :d="s.d"
            fill="none"
            stroke="var(--ink)"
            :stroke-width="selected === s.postal ? 2.5 : 1.75"
            pointer-events="none"
          />
        </template>
      </g>
    </svg>
    <div class="mt-2 flex flex-wrap gap-1.5" aria-label="Small states">
      <button
        v-for="postal in SMALL_STATES"
        :key="postal"
        type="button"
        class="num flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
        :class="[
          selected === postal ? 'border-ink' : 'border-map-line',
          isSelectable(postal) ? 'hover:border-ink' : 'text-muted cursor-default',
        ]"
        :aria-label="labelFor(postal)"
        :aria-pressed="isSelectable(postal) ? selected === postal : undefined"
        :aria-disabled="!isSelectable(postal)"
        :title="labelFor(postal)"
        @click="select(postal)"
      >
        <svg width="12" height="12" aria-hidden="true">
          <rect width="12" height="12" rx="2" :fill="fillFor(postal).fill" :fill-opacity="fillFor(postal).opacity" stroke="var(--map-line)" />
        </svg>
        {{ postal }}
      </button>
    </div>
  </div>
</template>
