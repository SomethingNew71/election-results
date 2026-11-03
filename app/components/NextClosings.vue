<script setup lang="ts">
import { upcomingClosings } from '#shared/utils/pollClosings'

const now = useClock()
const groups = computed(() => upcomingClosings(now.value, 3))

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}
function countdown(iso: string) {
  const s = Math.max(0, Math.round((Date.parse(iso) - now.value) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `in ${h}h ${m}m` : m ? `in ${m}m` : `in ${s}s`
}
</script>

<template>
  <section v-if="groups.length" class="rounded-lg border border-rule bg-panel px-5 py-3" aria-label="Next poll closings">
    <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <h2 class="kicker">Next poll closings (ET)</h2>
      <div v-for="g in groups" :key="g.at" class="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span class="num font-semibold">{{ clock(g.at) }}</span>
        <span class="num text-muted text-xs">{{ countdown(g.at) }}</span>
        <span class="num">{{ g.first.join(' ') }}</span>
        <span v-if="g.last.length" class="num text-muted" :title="`Last polls close in ${g.last.join(', ')}`">
          + rest of {{ g.last.join(' ') }}
        </span>
      </div>
    </div>
  </section>
</template>
