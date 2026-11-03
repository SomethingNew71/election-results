import type { Freshness } from '#shared/types'

/** Refresh interval for live results. civicAPI caches for 15 s upstream. */
export const REFRESH_MS = 30_000

/**
 * Fetch a JSON endpoint and refresh it on an interval while the tab is visible.
 * `dataAge` is the age of the data at civicAPI's end, not of the last poll.
 */
export function useLive<T extends Freshness>(url: MaybeRefOrGetter<string>, key: MaybeRefOrGetter<string>) {
  const result = useFetch<T>(url, { key, watch: [() => toValue(url)] })
  const now = ref(Date.now())

  onMounted(() => {
    const refresher = setInterval(() => {
      if (document.visibilityState === 'visible') result.refresh()
    }, REFRESH_MS)
    const ticker = setInterval(() => (now.value = Date.now()), 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') result.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    onBeforeUnmount(() => {
      clearInterval(refresher)
      clearInterval(ticker)
      document.removeEventListener('visibilitychange', onVisible)
    })
  })

  const dataAge = computed(() => {
    const asOf = result.data.value?.dataAsOf
    return asOf ? Math.max(0, Math.round((now.value - Date.parse(asOf)) / 1000)) : null
  })
  /** True when the data is old enough that users should be told. */
  const isOld = computed(() => Boolean(result.data.value?.stale) || (dataAge.value ?? 0) > 120)
  return { ...result, dataAge, isOld }
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return '–'
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.floor(seconds / 60)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`
}

/** Load TopoJSON once per page session. */
const geoCache = new Map<string, Promise<unknown>>()
export function loadGeo<T>(path: string): Promise<T> {
  if (!geoCache.has(path)) geoCache.set(path, $fetch(path))
  return geoCache.get(path) as Promise<T>
}

const OFFICEHOLDER_KEY = 'show-officeholders'

/**
 * Viewer preference: shade states with no race by the party of the current
 * officeholders. Off by default. Stored per browser.
 */
export function useShowOfficeholders() {
  const show = useState('show-officeholders', () => false)
  onMounted(() => {
    try {
      show.value = localStorage.getItem(OFFICEHOLDER_KEY) === '1'
    } catch {
      // Storage can be blocked; the default stays.
    }
  })
  watch(show, (v) => {
    try {
      localStorage.setItem(OFFICEHOLDER_KEY, v ? '1' : '0')
    } catch {
      // Ignore.
    }
  })
  return show
}
