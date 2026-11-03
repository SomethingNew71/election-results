<template>
  <div class="mx-auto min-h-screen max-w-7xl px-4 pb-16 sm:px-6">
    <header class="flex flex-wrap items-end justify-between gap-3 pt-6 pb-4">
      <NuxtLink to="/" class="block">
        <div class="kicker">United States · November 3, 2026</div>
        <div class="font-display text-3xl font-bold tracking-tight sm:text-4xl">Election Night Results</div>
      </NuxtLink>
      <p class="text-muted max-w-sm text-sm">
        Live vote counts and arithmetic estimates. No ratings, no endorsements, no race calls of our own.
      </p>
    </header>

    <NuxtPage />

    <footer class="text-muted mt-12 border-t border-rule pt-6 text-xs leading-relaxed">
      <p>
        Results data from <a href="https://civicapi.org" class="underline underline-offset-2 hover:text-ink">civicAPI</a>. Candidate
        colours come from civicAPI. "Called" means civicAPI has marked a winner; every other status is an estimate computed in your
        browser from the reported count.
      </p>
      <p class="mt-2">Map geometry: US Census Bureau via us-atlas. Page refreshes every 30 seconds while open.</p>
    </footer>
  </div>
</template>
