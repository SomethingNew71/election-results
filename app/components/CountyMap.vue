<script setup lang="ts">
import { geoIdentity, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { RegionResult } from '#shared/types'

const props = defineProps<{
  /** Two-digit state FIPS. */
  stateFips: string
  regions: RegionResult[]
}>()

type CountiesTopo = Topology<{ counties: GeometryCollection; states: GeometryCollection }>
const topo = shallowRef<CountiesTopo | null>(null)
onMounted(async () => {
  topo.value = await loadGeo<CountiesTopo>('/geo/counties-albers-10m.json')
})

const W = 600
const H = 420

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/\b(county|parish|borough|census area|city and borough|municipality)\b/g, '')
    .replace(/[^a-z]/g, '')
}

/** Independent cities ("Fairfax City" vs Fairfax County) get their own key. */
function cityKey(name: string): string {
  return `${normalize(name.replace(/\s+city$/i, ''))}|city`
}

const byFips = computed(() => new Map(props.regions.filter((r) => r.fips).map((r) => [r.fips!, r])))
const byName = computed(() => {
  const map = new Map<string, RegionResult>()
  for (const r of props.regions) {
    map.set(normalize(r.name), r)
    if (/\scity$/i.test(r.name)) map.set(cityKey(r.name), r)
  }
  return map
})

function lookup(id: string, name: string): RegionResult | null {
  const fipsHit = byFips.value.get(id)
  if (fipsHit) return fipsHit
  // County FIPS codes 500+ are independent cities (VA, Baltimore, St. Louis, Carson City).
  if (Number(id.slice(2)) >= 500) return byName.value.get(cityKey(name)) ?? byName.value.get(normalize(name)) ?? null
  return byName.value.get(normalize(name)) ?? null
}

const shapes = computed(() => {
  if (!topo.value) return { counties: [], outline: '' }
  const counties = feature(topo.value, topo.value.objects.counties).features.filter((f) =>
    String(f.id).startsWith(props.stateFips),
  ) as Feature<Geometry, { name: string }>[]
  const stateShape = feature(topo.value, topo.value.objects.states).features.find(
    (f) => String(f.id) === props.stateFips,
  )
  const fitTarget: FeatureCollection = { type: 'FeatureCollection', features: stateShape ? [stateShape] : counties }
  const path = geoPath(geoIdentity().fitExtent([[8, 8], [W - 8, H - 8]], fitTarget))

  return {
    outline: stateShape ? (path(stateShape) ?? '') : '',
    counties: counties.map((f) => {
      const region = lookup(String(f.id), f.properties.name)
      const inf = region ? inferRace(region.candidates, region.pct) : null
      const leader = inf?.leader && inf.counted > 0 ? inf.leader : null
      // Shade by margin so lopsided counties read darker than close ones.
      const opacity = leader ? 0.25 + Math.min(inf!.marginShare, 0.5) * 1.5 : 0
      return { id: String(f.id), name: f.properties.name, d: path(f) ?? '', region, leader, inf, opacity }
    }),
  }
})

const hover = ref<(typeof shapes.value.counties)[number] | null>(null)
</script>

<template>
  <div class="relative">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" aria-label="County results map">
      <rect v-if="!topo" :width="W" :height="H" fill="var(--empty)" opacity="0.4" rx="8" />
      <g v-else>
        <path
          v-for="c in shapes.counties"
          :key="c.id"
          :d="c.d"
          :fill="c.leader ? c.leader.color : 'var(--empty)'"
          :fill-opacity="c.leader ? c.opacity : 1"
          stroke="var(--map-line)"
          stroke-width="0.5"
          @mouseenter="hover = c"
          @mouseleave="hover = null"
          @click="hover = hover?.id === c.id ? null : c"
        />
        <path :d="shapes.outline" fill="none" stroke="var(--ink)" stroke-width="1.25" pointer-events="none" />
      </g>
    </svg>
    <div
      v-if="hover"
      class="pointer-events-none absolute top-2 left-2 max-w-[16rem] rounded border border-rule bg-panel px-3 py-2 text-xs shadow-sm"
    >
      <div class="font-semibold">{{ hover.region?.name ?? hover.name }}</div>
      <template v-if="hover.region && hover.inf">
        <div class="kicker mt-0.5">{{ hover.region.pct }}% reporting</div>
        <div
          v-for="c in sortByVotes(hover.region.candidates).slice(0, 3)"
          :key="c.name"
          class="mt-1 flex justify-between gap-4"
        >
          <span class="flex items-center gap-1.5 truncate">
            <span class="inline-block size-2 shrink-0 rounded-full" :style="{ background: c.color }" />
            {{ c.name }}
          </span>
          <span class="num">{{ hover.inf.counted ? formatShare(c.votes / hover.inf.counted) : '–' }}</span>
        </div>
      </template>
      <div v-else class="text-muted mt-0.5">No results for this area</div>
    </div>
  </div>
</template>
