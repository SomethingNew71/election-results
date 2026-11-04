import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedGet } from '../server/utils/civic'
import raceSeed from '../server/data/race-seed.json'

const json = (body: unknown) => new Response(JSON.stringify(body))
const hang = () => new Promise<Response>(() => {})
let n = 0
/** The cache is per module, so every test needs its own URL. */
const freshUrl = () => `https://example.test/${++n}`

async function seed(url: string, ageMs: number) {
  fetchMock.mockResolvedValueOnce(json({ v: 'old' }))
  await cachedGet(url, 'test')
  vi.advanceTimersByTime(ageMs)
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string }) => Object.assign(new Error(e.statusMessage), e))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('cachedGet with a cached copy', () => {
  it('serves a copy under 90 s at once and refreshes in the background', async () => {
    const url = freshUrl()
    await seed(url, 30_000)
    fetchMock.mockImplementationOnce(hang)
    const waited: Promise<unknown>[] = []
    const got = await cachedGet<{ v: string }>(url, 'test', undefined, undefined, (p) => waited.push(p))
    expect(got).toMatchObject({ data: { v: 'old' }, stale: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(waited).toHaveLength(1)
  })

  it('gives a hung source 2 s, then serves the copy marked stale', async () => {
    const url = freshUrl()
    await seed(url, 120_000)
    fetchMock.mockImplementationOnce(hang)
    const got = cachedGet<{ v: string }>(url, 'test')
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(got).resolves.toMatchObject({ data: { v: 'old' }, stale: true })
  })

  it('serves the copy marked stale when the source fails at once', async () => {
    const url = freshUrl()
    await seed(url, 120_000)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(cachedGet(url, 'test')).resolves.toMatchObject({ data: { v: 'old' }, stale: true })
  })

  it('returns new data when the refresh arrives inside the 2 s', async () => {
    const url = freshUrl()
    await seed(url, 120_000)
    fetchMock.mockResolvedValueOnce(json({ v: 'new' }))
    await expect(cachedGet(url, 'test')).resolves.toMatchObject({ data: { v: 'new' }, stale: false })
  })

  it('shares one refresh between readers while the source hangs', async () => {
    const url = freshUrl()
    await seed(url, 120_000)
    fetchMock.mockImplementationOnce(hang)
    const readers = [cachedGet(url, 'test'), cachedGet(url, 'test')]
    await vi.advanceTimersByTimeAsync(2_000)
    await Promise.all(readers)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('cachedGet without a usable copy', () => {
  it('returns an error when there is no copy', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(cachedGet(freshUrl(), 'test')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('returns an error when the copy is past 10 minutes', async () => {
    const url = freshUrl()
    await seed(url, 10 * 60_000)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(cachedGet(url, 'test')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('passes a 404 through, even with a copy', async () => {
    const url = freshUrl()
    await seed(url, 120_000)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(cachedGet(url, 'test')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the bundled race list', () => {
  const url = 'https://civicapi.org/api/v2/race/search?country=US&startDate=2026-11-03&endDate=2026-11-03&election_type=General&limit=5000'

  it('answers a cold start when civicAPI fails, marked stale, with its capture time', async () => {
    vi.setSystemTime(Date.parse(raceSeed.capturedAt) + 60 * 60_000)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    const got = await cachedGet<{ races: unknown[] }>(url, 'civicAPI')
    expect(got.stale).toBe(true)
    expect(got.fetchedAt).toBe(Date.parse(raceSeed.capturedAt))
    expect(got.data.races).toHaveLength(raceSeed.General.length)
  })
})
