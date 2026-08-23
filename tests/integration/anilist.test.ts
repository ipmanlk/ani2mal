import { describe, expect, it } from '../helpers/testkit.ts'
import { AnilistClient } from '@/api/anilist/client.ts'
import { jsonRes, makeFetch } from '../helpers/fake-fetch.ts'

const GRAPHQL = 'https://graphql.anilist.co'

describe('AnilistClient', () => {
  it('sends variables.userName and not interpolated', async () => {
    let body: unknown
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: async (req) => {
          body = await req.json()
          return jsonRes({ data: { MediaListCollection: { lists: [] } } })
        },
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    await c.getLists('Jimmy123')
    expect((body as { variables: { userName: string; type: string } }).variables.userName).toBe(
      'Jimmy123',
    )
    const { query } = body as { query: string }
    // the document must carry only the placeholder, never the username
    expect(query).not.toContain('Jimmy123')
    expect(JSON.stringify((body as { variables: unknown }).variables)).toContain('Jimmy123')
  })

  it('fetches anime and manga concurrently', async () => {
    let count = 0
    let concurrentPeak = 0
    let active = 0
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: async () => {
          active++
          concurrentPeak = Math.max(concurrentPeak, active)
          await new Promise((r) => setTimeout(r, 20))
          active--
          count++
          return jsonRes({ data: { MediaListCollection: { lists: [] } } })
        },
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    await c.getLists('U')
    expect(count).toBe(2)
    expect(concurrentPeak).toBe(2)
  })

  it('throws on errors[]', async () => {
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: () => jsonRes({ errors: [{ message: 'boom' }] }),
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    await expect(c.getLists('U')).rejects.toThrow(/boom/)
  })

  it('throws NotFound when null collection', async () => {
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: () => jsonRes({ data: { MediaListCollection: null } }),
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    await expect(c.getLists('UnknownUser')).rejects.toThrow(/No list for/)
  })

  it('skips idMal null and counts', async () => {
    const lists = [
      {
        name: 'Watching',
        status: 'CURRENT',
        isCustomList: false,
        isSplitCompletedList: false,
        entries: [
          {
            id: 1,
            status: 'CURRENT',
            score: 5,
            progress: 1,
            progressVolumes: null,
            repeat: 0,
            media: {
              idMal: null,
              episodes: 12,
              chapters: null,
              title: { romaji: 'x', english: 'x' },
            },
          },
          {
            id: 2,
            status: 'CURRENT',
            score: 5,
            progress: 1,
            progressVolumes: null,
            repeat: 0,
            media: {
              idMal: 10,
              episodes: 12,
              chapters: null,
              title: { romaji: 'x', english: 'x' },
            },
          },
        ],
      },
    ]
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: () => jsonRes({ data: { MediaListCollection: { lists } } }),
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    const res = await c.getLists('U')
    expect(res.anime.skippedNoMalId).toBe(1)
    expect(res.anime.list).toHaveLength(1)
    const first = res.anime.list[0]
    if (!first) throw new Error('expected one mapped entry')
    expect(first.id).toBe(10)
  })

  it('aborted before network makes zero calls', async () => {
    let called = 0
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: () => {
          called++
          return jsonRes({ data: { MediaListCollection: { lists: [] } } })
        },
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    const ctrl = new AbortController()
    ctrl.abort(new (await import('@/lib/errors.ts')).CancelledError('cancelled'))
    await expect(c.getLists('U', ctrl.signal)).rejects.toThrow()
    expect(called).toBe(0)
  })
})

describe('AnilistClient custom lists', () => {
  it('ignores custom and split-completed lists so entries are not duplicated', async () => {
    const entry = (id: number) => ({
      id,
      status: 'COMPLETED',
      score: 5,
      progress: 1,
      progressVolumes: null,
      repeat: 0,
      media: { idMal: id, episodes: 12, chapters: null, title: { romaji: 'x', english: 'x' } },
    })
    const lists = [
      {
        name: 'Completed',
        status: 'COMPLETED',
        isCustomList: false,
        isSplitCompletedList: false,
        entries: [entry(10), entry(11)],
      },
      {
        name: 'Favourites',
        status: null,
        isCustomList: true,
        isSplitCompletedList: false,
        entries: [entry(10)],
      },
      {
        name: 'Completed (split)',
        status: 'COMPLETED',
        isCustomList: false,
        isSplitCompletedList: true,
        entries: [entry(11)],
      },
    ]
    const fetchImpl = makeFetch([
      {
        method: 'POST',
        pattern: GRAPHQL,
        respond: () => jsonRes({ data: { MediaListCollection: { lists } } }),
      },
    ])
    const c = new AnilistClient(fetchImpl, 15_000)
    const res = await c.getLists('U')
    expect(res.anime.list).toHaveLength(2)
    expect(res.anime.stats.total).toBe(2)
  })
})
