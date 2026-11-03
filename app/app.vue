<script setup lang="ts">
const archived = useArchive()
</script>

<template>
  <div class="mx-auto min-h-screen max-w-7xl px-4 pb-16 sm:px-6">
    <header class="flex flex-wrap items-end justify-between gap-3 pt-6 pb-4">
      <NuxtLink to="/" class="block">
        <div class="kicker">United States · November 3, 2026</div>
        <div class="font-display text-3xl font-bold tracking-tight sm:text-4xl">Election Night Results</div>
      </NuxtLink>
      <div class="max-w-sm text-sm">
        <p class="text-muted">Live vote counts and arithmetic estimates. No ratings, no endorsements, no race calls of our own.</p>
        <nav class="mt-1 flex gap-3" aria-label="Pages">
          <NuxtLink to="/" class="underline-offset-2 hover:underline" active-class="font-semibold" exact-active-class="font-semibold">Results</NuxtLink>
          <NuxtLink to="/forecast" class="text-muted underline-offset-2 hover:text-ink hover:underline" active-class="font-semibold !text-ink">civicAPI forecast</NuxtLink>
        </nav>
      </div>
    </header>

    <NuxtPage />

    <footer class="text-muted mt-12 border-t border-rule pt-6 text-xs leading-relaxed">
      <p>
        Results data from <a href="https://civicapi.org" class="underline underline-offset-2 hover:text-ink">civicAPI</a>, cross-checked
        against official state results feeds where available (Arkansas, Colorado, Delaware, Iowa, Missouri, Ohio, Virginia). Colours
        are fixed per party. "Called" means civicAPI has marked a winner; every other status is an estimate computed in your
        browser from the reported count.
      </p>
      <p class="mt-2">
        Map geometry: US Census Bureau via us-atlas. 2024 county results:
        <a href="https://github.com/tonmcg/US_County_Level_Election_Results_08-24" class="underline underline-offset-2 hover:text-ink">tonmcg</a>
        (MIT).
        <template v-if="archived">These are the final results as captured after election night; the page no longer updates.</template>
        <template v-else>Page refreshes every 30 seconds while open.</template>
      </p>
    </footer>
  </div>
</template>
