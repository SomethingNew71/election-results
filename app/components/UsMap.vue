<script setup lang="ts">
import { geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, Geometry } from 'geojson'

export interface StateFill {
  color: string
  opacity: number
  /** Race on the ballot but with no readable result yet. */
  pending: boolean
  title: string
}

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

const hovered = ref<string | null>(null)
</script>

<template>
  <div class="relative">
    <svg viewBox="0 0 975 610" class="h-auto w-full" role="img" aria-label="Map of US states">
      <defs>
        <pattern id="pending-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--empty)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" stroke-width="1.5" stroke-opacity="0.8" />
        </pattern>
      </defs>
      <g v-if="!topo">
        <rect width="975" height="610" fill="var(--empty)" opacity="0.4" rx="8" />
      </g>
      <g v-else>
        <g v-for="s in shapes" :key="s.postal">
          <path
            v-if="fills[s.postal]"
            :d="s.d"
            :fill="fills[s.postal]!.pending ? 'url(#pending-hatch)' : 'var(--empty)'"
          />
          <path
            :d="s.d"
            :fill="fills[s.postal] && !fills[s.postal]!.pending ? fills[s.postal]!.color : 'var(--empty)'"
            :fill-opacity="fills[s.postal] ? (fills[s.postal]!.pending ? 0 : fills[s.postal]!.opacity) : 0.35"
            :class="fills[s.postal] ? 'cursor-pointer' : ''"
            :stroke="selected === s.postal || hovered === s.postal ? 'var(--ink)' : 'none'"
            stroke-width="2"
            @mouseenter="hovered = s.postal"
            @mouseleave="hovered = null"
            @click="fills[s.postal] && emit('select', s.postal)"
          >
            <title>{{ fills[s.postal]?.title ?? `${s.name}: no race` }}</title>
          </path>
        </g>
        <path :d="borders" fill="none" stroke="var(--paper)" stroke-width="1" stroke-linejoin="round" pointer-events="none" />
        <g v-for="s in shapes" :key="`sel-${s.postal}`">
          <path
            v-if="selected === s.postal"
            :d="s.d"
            fill="none"
            stroke="var(--ink)"
            stroke-width="2.5"
            pointer-events="none"
          />
        </g>
      </g>
    </svg>
  </div>
</template>
