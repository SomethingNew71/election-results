<script setup lang="ts">
/** Results / Forecast switch above the chamber tabs. Keeps the chamber (`view`) when switching. */
const route = useRoute()
const archived = useArchive()
const view = computed(() => (typeof route.query.view === 'string' ? { view: route.query.view } : {}))
const MODES = [
  { path: '/', label: 'Results' },
  { path: '/forecast', label: 'Forecast' },
] as const
</script>

<template>
  <nav v-if="!archived" class="mb-4 inline-flex rounded-md border border-rule bg-panel p-0.5 text-sm" aria-label="Results or forecast">
    <NuxtLink
      v-for="m in MODES"
      :key="m.path"
      :to="{ path: m.path, query: view }"
      class="rounded px-4 py-1.5 font-semibold transition-colors"
      :class="route.path === m.path ? 'bg-ink text-paper' : 'text-muted hover:text-ink'"
      :aria-current="route.path === m.path ? 'page' : undefined"
    >
      {{ m.label }}
    </NuxtLink>
  </nav>
</template>
