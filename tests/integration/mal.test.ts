import { describe, expect, it } from '../helpers/testkit.ts'
import { MalClient } from '@/api/mal/client.ts'
import { mapMalDatum } from '@/api/mal/mapper.ts'
import type { TokenProvider } from '@/ports/token.ts'
import { jsonRes, makeFetch, type Route } from '../helpers/fake-fetch.ts'
import { type FakeFn, fakeFn } from '../helpers/fakes.ts'

function makeTokenProvider(token = 'tok1234567890', refreshImpl?: () => Promise<unknown>) {
  return {
    getAccessToken: fakeFn(() => token),
    refresh: refreshImpl ? (fakeFn(() => refreshImpl()) as FakeFn) : fakeFn(() =>
      Promise.resolve({
        access_token: 'new',
        refresh_token: 'r',
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      })
    ),
  } as unknown as TokenProvider & { getAccessToken: FakeFn; refresh: FakeFn }
}

describe('MalClient read pagination', () => {
  it('terminates on paging.next: null after exactly 1000 items (no third request)', async () => {
    let calls = 0
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: /api\.myanimelist\.net\/v2\/users\/@me\/animelist/,
        respond: (req) => {
          calls++
          const url = new URL(req.url)
          if (url.searchParams.get('offset') === '0') {
            return jsonRes({
              data: [
                {
                  node: { id: 1, title: 'A', num_episodes: 12 },
                  list_status: {
                    status: 'watching',
                    score: 7,
                    num_episodes_watched: 5,
                    is_rewatching: false,
                  },
                },
              ],
              paging: {
                next:
                  'https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status&limit=1000&offset=1000&nsfw=true',
              },
            })
          }
          // second page would be 1000 items in real life; one item and no
          // paging.next is enough to prove the loop stops here
          return jsonRes({
            data: [
              {
                node: { id: 2, title: 'B', num_episodes: 12 },
                list_status: {
                  status: 'watching',
                  score: 7,
                  num_episodes_watched: 5,
                  is_rewatching: false,
                },
              },
            ],
            paging: {},
          })
        },
      },
      {
        method: 'GET',
        pattern: /api\.myanimelist\.net\/v2\/users\/@me\/mangalist/,
        respond: () => jsonRes({ data: [], paging: {} }),
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    const res = await c.getLists()
    expect(res.anime).toHaveLength(2)
    expect(calls).toBe(2)
  })

  it('continues when data: [] but paging.next present', async () => {
    let calls = 0
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: /api\.myanimelist\.net\/v2\/users\/@me\/animelist/,
        respond: (req) => {
          calls++
          const url = new URL(req.url)
          if (url.searchParams.get('offset') === '0') {
            return jsonRes({
              data: [],
              paging: {
                next:
                  'https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status&limit=1000&offset=1000&nsfw=true',
              },
            })
          }
          return jsonRes({
            data: [
              {
                node: { id: 5, title: 'E', num_episodes: 12 },
                list_status: {
                  status: 'watching',
                  score: 5,
                  num_episodes_watched: 1,
                  is_rewatching: false,
                },
              },
            ],
            paging: {},
          })
        },
      },
      {
        method: 'GET',
        pattern: /api\.myanimelist\.net\/v2\/users\/@me\/mangalist/,
        respond: () => jsonRes({ data: [], paging: {} }),
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    const res = await c.getLists()
    expect(res.anime).toHaveLength(1)
    expect(calls).toBe(2)
  })

  it('query strings carry nsfw=true', async () => {
    const urls: string[] = []
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: /api\.myanimelist\.net\/v2\/users\/@me\/.*list/,
        respond: (req) => {
          urls.push(req.url)
          return jsonRes({ data: [], paging: {} })
        },
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    await c.getLists()
    expect(urls.every((u) => u.includes('nsfw=true'))).toBe(true)
    expect(urls.every((u) => u.includes('limit=1000'))).toBe(true)
  })
})

describe('MalClient write', () => {
  it('PUT body has correct keys for anime', async () => {
    let body = ''
    const routes: Route[] = [
      {
        method: 'PUT',
        pattern: /api\.myanimelist\.net\/v2\/anime\/\d+\/my_list_status/,
        respond: async (req) => {
          body = await req.text()
          return jsonRes({})
        },
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    const media = {
      type: 'anime',
      id: 1,
      progress: 5,
      score: 8,
      status: 'current',
      repeat: 1,
      length: 12,
    } as never
    await c.updateOne(media)
    const p = new URLSearchParams(body)
    expect(p.get('status')).toBe('watching')
    expect(p.get('score')).toBe('8')
    expect(p.get('num_watched_episodes')).toBe('5')
    // The rewatch flag belongs to MAL; we neither read it into repeat nor send it.
    expect(p.get('is_rewatching')).toBe(null)
  })

  it('PUT body for manga', async () => {
    let body = ''
    const routes: Route[] = [
      {
        method: 'PUT',
        pattern: /api\.myanimelist\.net\/v2\/manga\/\d+\/my_list_status/,
        respond: async (req) => {
          body = await req.text()
          return jsonRes({})
        },
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    const media = {
      type: 'manga',
      id: 101,
      progress: 3,
      score: 7,
      status: 'current',
      repeat: 0,
      length: 50,
    } as never
    await c.updateOne(media)
    const p = new URLSearchParams(body)
    expect(p.get('num_chapters_read')).toBe('3')
    expect(p.get('is_rereading')).toBe(null)
  })

  it('DELETE has no body', async () => {
    let hasBody = false
    const routes: Route[] = [
      {
        method: 'DELETE',
        pattern: /api\.myanimelist\.net\/v2\/anime\/\d+\/my_list_status/,
        respond: async (req) => {
          const t = await req.text()
          hasBody = t.length > 0
          return jsonRes({})
        },
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    await c.deleteOne({
      type: 'anime',
      id: 1,
      progress: 0,
      score: 0,
      status: 'current',
      repeat: 0,
      length: null,
    } as never)
    expect(hasBody).toBe(false)
  })
})

describe('MalClient 401 and 429', () => {
  it('401 → one refresh then retry succeeds', async () => {
    let putCalls = 0
    const routes: Route[] = [
      {
        method: 'PUT',
        pattern: /api\.myanimelist\.net\/v2\/anime\/\d+\/my_list_status/,
        respond: () => {
          putCalls++
          if (putCalls === 1) return jsonRes({}, 401)
          return jsonRes({})
        },
      },
    ]
    const tp = makeTokenProvider('oldtoken', () =>
      Promise.resolve({
        access_token: 'newtoken123456',
        refresh_token: 'r',
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }))
    const c = new MalClient(makeFetch(routes), tp)
    await c.updateOne({
      type: 'anime',
      id: 1,
      progress: 1,
      score: 5,
      status: 'current',
      repeat: 0,
      length: null,
    } as never)
    expect(tp.refresh.calls).toHaveLength(1)
    expect(putCalls).toBe(2)
  })

  it('second 401 → AuthError', async () => {
    const routes: Route[] = [
      {
        method: 'PUT',
        pattern: /api\.myanimelist\.net\/v2\/anime\/\d+\/my_list_status/,
        respond: () => jsonRes({}, 401),
      },
    ]
    const tp = makeTokenProvider('old', () =>
      Promise.resolve({
        access_token: 'new1234567890',
        refresh_token: 'r',
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }))
    const c = new MalClient(makeFetch(routes), tp)
    await expect(
      c.updateOne({
        type: 'anime',
        id: 1,
        progress: 1,
        score: 5,
        status: 'current',
        repeat: 0,
        length: null,
      } as never),
    ).rejects.toThrow(/Refresh token expired/)
  })

  it('429 respects Retry-After', async () => {
    let calls = 0
    const routes: Route[] = [
      {
        method: 'PUT',
        pattern: /api\.myanimelist\.net\/v2\/anime\/\d+\/my_list_status/,
        respond: () => {
          calls++
          if (calls < 3) return new Response(null, { status: 429, headers: { 'Retry-After': '0' } })
          return jsonRes({})
        },
      },
    ]
    const tp = makeTokenProvider()
    const c = new MalClient(makeFetch(routes), tp)
    await c.updateOne({
      type: 'anime',
      id: 1,
      progress: 1,
      score: 5,
      status: 'current',
      repeat: 0,
      length: null,
    } as never)
    expect(calls).toBe(3)
  })
})

describe('mapMalDatum', () => {
  const base = {
    node: { id: 7, title: 'G', num_episodes: 12 },
    list_status: { status: 'watching', score: 5, num_episodes_watched: 3 },
  }

  it('maps counts into repeat and ignores the bare rewatch flag', () => {
    const m = mapMalDatum(
      { ...base, list_status: { ...base.list_status, is_rewatching: true } } as never,
      'anime',
    )
    // AniList has no "currently rewatching" state, so a bare flag must not
    // manufacture a repeat count; only completed rewatch numbers do.
    expect(m.repeat).toBe(0)
    const counted = mapMalDatum(
      {
        ...base,
        list_status: { ...base.list_status, is_rewatching: true, num_times_rewatched: 2 },
      } as never,
      'anime',
    )
    expect(counted.repeat).toBe(2)
  })

  it('throws on a status outside the known MAL vocabulary', () => {
    expect(() =>
      mapMalDatum(
        { ...base, list_status: { ...base.list_status, status: 'hibernating' } } as never,
        'anime',
      )
    ).toThrow(/unknown MAL list status/)
  })

  it('manga reads chapters and reread count', () => {
    const m = mapMalDatum(
      {
        node: { id: 8, title: 'H', num_chapters: 40 },
        list_status: { status: 'reading', score: 0, num_chapters_read: 9, num_times_reread: 1 },
      } as never,
      'manga',
    )
    expect(m.progress).toBe(9)
    expect(m.repeat).toBe(1)
    expect(m.length).toBe(40)
  })
})
