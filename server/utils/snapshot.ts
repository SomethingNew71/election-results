import type { H3Event } from 'h3'

/**
 * One shared snapshot for every isolate. API requests are forwarded to a
 * single Durable Object (nitro's `cloudflare_durable` preset runs the same
 * app inside it), so the upstream caches in civic.ts and stateFeeds.ts are
 * shared: civicAPI and the state feeds see one client, and a cold isolate
 * gets warm data instead of a 2 s civicAPI miss. While people are reading,
 * an alarm refreshes the data every ALARM_MS, so even the first request
 * after a quiet spell is served warm.
 */
interface DurableLike {
  ctx: { storage: { getAlarm(): Promise<number | null>; setAlarm(t: number): Promise<void> }; waitUntil(p: Promise<unknown>): void }
}

interface DurableNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(req: Request): Promise<Response> }
}

interface CloudflareContext {
  env?: { $DurableObject?: DurableNamespace; CF_VERSION_METADATA?: { id: string } }
  durable?: DurableLike
}

/**
 * Object name. It carries the Worker version: a busy object (requests plus the
 * 15 s alarm) kept serving the old code after a deploy, so each version gets
 * its own object. The old one stops once its alarm sees no requests for
 * WARM_FOR_MS.
 */
const INSTANCE = 'server'

const ALARM_MS = 15_000
/** A forward slower than this is abandoned and the isolate answers itself. */
const FORWARD_TIMEOUT_MS = 2_500
/** Keep refreshing for this long after the last request. */
const WARM_FOR_MS = 5 * 60_000
let lastRequestAt = 0

function cloudflare(event: H3Event): CloudflareContext | undefined {
  return event.context.cloudflare as CloudflareContext | undefined
}

/**
 * Forward the request to the snapshot object. Returns null when this code
 * already runs inside it, in dev, or when the object cannot be reached (the
 * isolate then answers on its own).
 */
export async function viaSnapshot(event: H3Event): Promise<Response | null> {
  const cf = cloudflare(event)
  if (cf?.durable) {
    lastRequestAt = Date.now()
    const storage = cf.durable.ctx.storage
    cf.durable.ctx.waitUntil(
      storage.getAlarm().then((t) => (t === null ? storage.setAlarm(Date.now() + ALARM_MS) : undefined)),
    )
    return null
  }
  // SSR's internal API calls have no cloudflare context; the env global still has the binding.
  const env = cf?.env ?? (globalThis as { __env__?: CloudflareContext['env'] }).__env__
  const ns = env?.$DurableObject
  if (!ns) return null
  try {
    const url = getRequestURL(event)
    const name = `${INSTANCE}-${env?.CF_VERSION_METADATA?.id ?? 'local'}`
    const forward = ns.get(ns.idFromName(name)).fetch(new Request(url, { headers: { accept: 'application/json' } }))
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FORWARD_TIMEOUT_MS))
    const res = await Promise.race([forward, timeout])
    if (!res) console.warn(`Snapshot object slower than ${FORWARD_TIMEOUT_MS} ms; answering from this isolate`)
    return res
  } catch (err) {
    console.warn('Snapshot object unreachable; answering from this isolate', err)
    return null
  }
}

/** Alarm handler: refresh the shared caches while people are reading. */
export async function refreshSnapshot(durable: DurableLike): Promise<void> {
  if (Date.now() - lastRequestAt > WARM_FOR_MS) return
  const waitUntil = (p: Promise<unknown>) => durable.ctx.waitUntil(p)
  try {
    await Promise.all([trackedRaces(waitUntil), stateFeedRaces(waitUntil)])
  } catch (err) {
    console.warn('Snapshot refresh failed', err)
  }
  await durable.ctx.storage.setAlarm(Date.now() + ALARM_MS)
}
