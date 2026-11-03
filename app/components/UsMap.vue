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
    return { postal, name: f.properties.name, d: path(f) ?? '' }
  })
})
const borders = computed(() =>
  topo.value ? (path(mesh(topo.value, topo.value.objects.states, (a, b) => a !== b)) ?? '') : '',
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
  if (!f) return { fill: 'var(--empty)', opacity: 0.35 }
  if (f.mode === 'pending') return { fill: 'url(#pending-dots)', opacity: 1 }
  if (f.mode === 'holder') return { fill: `url(#${patternId(f.colors)})`, opacity: 1 }
  return { fill: f.color, opacity: f.opacity }
}

const isSelectable = (postal: string) => props.fills[postal] && props.fills[postal]!.mode !== 'holder'

function onKey(e: KeyboardEvent, postal: string) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('select', postal)
  }
}

const hovered = ref<string | null>(null)
</script>

<template>
  <svg viewBox="0 0 975 610" class="h-auto w-full" role="group" aria-label="Map of US states">
    <defs>
      <pattern id="pending-dots" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="var(--empty)" />
        <circle cx="3.5" cy="3.5" r="1.1" fill="var(--muted)" fill-opacity="0.85" />
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
        <rect v-for="(c, i) in p.colors" :key="i" :x="i * 8" width="4" height="8" :fill="c" fill-opacity="0.55" />
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
        :stroke="isSelectable(s.postal) && (selected === s.postal || hovered === s.postal) ? 'var(--ink)' : 'none'"
        stroke-width="2"
        :tabindex="isSelectable(s.postal) ? 0 : undefined"
        :role="isSelectable(s.postal) ? 'button' : undefined"
        :aria-label="fills[s.postal]?.title ?? `${s.name}: no race`"
        :aria-pressed="isSelectable(s.postal) ? selected === s.postal : undefined"
        @mouseenter="hovered = s.postal"
        @mouseleave="hovered = null"
        @focus="hovered = s.postal"
        @blur="hovered = null"
        @click="isSelectable(s.postal) && emit('select', s.postal)"
        @keydown="isSelectable(s.postal) && onKey($event, s.postal)"
      >
        <title>{{ fills[s.postal]?.title ?? `${s.name}: no race` }}</title>
      </path>
      <path :d="borders" fill="none" stroke="var(--paper)" stroke-width="1" stroke-linejoin="round" pointer-events="none" />
      <template v-for="s in shapes" :key="`sel-${s.postal}`">
        <path v-if="selected === s.postal" :d="s.d" fill="none" stroke="var(--ink)" stroke-width="2.5" pointer-events="none" />
      </template>
    </g>
  </svg>
</template>
