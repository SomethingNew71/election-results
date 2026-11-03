/** Refresh interval for live results. civicAPI caches for 15 s upstream. */
export const REFRESH_MS = 30_000

/**
 * Fetch a JSON endpoint and refresh it on an interval while the tab is visible.
 */
export function useLive<T>(url: MaybeRefOrGetter<string>, key: MaybeRefOrGetter<string>) {
  const result = useFetch<T>(url, { key, watch: [() => toValue(url)] })
  const lastLoaded = ref<number>(Date.now())
  const now = ref(Date.now())

  watch(result.data, () => {
    lastLoaded.value = Date.now()
  })

  onMounted(() => {
    const refresher = setInterval(() => {
      if (document.visibilityState === 'visible') result.refresh()
    }, REFRESH_MS)
    const ticker = setInterval(() => (now.value = Date.now()), 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoaded.value > REFRESH_MS) {
        result.refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    onBeforeUnmount(() => {
      clearInterval(refresher)
      clearInterval(ticker)
      document.removeEventListener('visibilitychange', onVisible)
    })
  })

  const secondsAgo = computed(() => Math.max(0, Math.round((now.value - lastLoaded.value) / 1000)))
  return { ...result, secondsAgo }
}

/** Load TopoJSON once per page session. */
const geoCache = new Map<string, Promise<unknown>>()
export function loadGeo<T>(path: string): Promise<T> {
  if (!geoCache.has(path)) geoCache.set(path, $fetch(path))
  return geoCache.get(path) as Promise<T>
}
