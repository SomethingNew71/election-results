import type { Freshness } from '#shared/types'

/** Refresh interval for live results. civicAPI caches for 15 s upstream. */
export const REFRESH_MS = 30_000

/**
 * Fetch a JSON endpoint and refresh it on an interval while the tab is visible.
 * `dataAge` is the age of the data at civicAPI's end, not of the last poll.
 */
export function useLive<T extends Freshness>(url: MaybeRefOrGetter<string>, key: MaybeRefOrGetter<string>) {
  const result = useFetch<T>(url, { key, watch: [() => toValue(url)] })
  const now = useClock()

  onMounted(() => {
    const refresher = setInterval(() => {
      if (document.visibilityState === 'visible') result.refresh()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') result.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    onBeforeUnmount(() => {
      clearInterval(refresher)
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

const clock = ref(0)
let clockStarted = false

/**
 * Current time, updated every second in the browser. One timer for the whole
 * page. The browser starts from the server's render time, so ages match
 * during hydration, then moves to the real time on the first tick.
 */
export function useClock(): Readonly<Ref<number>> {
  const renderedAt = useState('rendered-at', () => Date.now())
  // On the server a module-level ref would hold the time the module loaded.
  if (import.meta.server) return ref(renderedAt.value)
  if (!clockStarted) {
    clockStarted = true
    clock.value = renderedAt.value
    setInterval(() => (clock.value = Date.now()), 1000)
  }
  return clock
}

/** Seconds since an ISO time, or null. */
export function ageOf(iso: string | null | undefined, now: number): number | null {
  return iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 1000)) : null
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
