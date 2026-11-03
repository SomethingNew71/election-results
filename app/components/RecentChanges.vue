<script setup lang="ts">
import type { RaceChange } from '~/composables/useRaceChanges'

defineProps<{ events: RaceChange[] }>()
const now = useClock()
</script>

<template>
  <section class="rounded-lg border border-rule bg-panel p-5">
    <p class="sr-only" aria-live="polite">{{ events[0] ? `${events[0].label}: ${events[0].text}` : '' }}</p>
    <h2 class="font-display text-lg font-semibold tracking-tight">Changes since you opened this page</h2>
    <p v-if="!events.length" class="text-muted mt-2 text-sm">
      Nothing yet. Leader changes, winner flags and status changes appear here as the count updates.
    </p>
    <ul v-else class="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
      <li v-for="e in events" :key="e.id" class="flex items-start gap-2">
        <span class="mt-1.5 inline-block size-2 shrink-0 rounded-full" :style="{ background: e.color ?? 'var(--muted)' }" />
        <span class="min-w-0">
          <NuxtLink :to="`/race/${e.raceId}`" class="font-medium underline-offset-4 hover:underline">{{ e.label }}</NuxtLink>
          <span class="text-muted"> · {{ e.text }}</span>
          <span class="num text-muted block text-xs">{{ formatAge(ageOf(new Date(e.at).toISOString(), now)) }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>
