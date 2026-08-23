import { describe, expect, it } from '../helpers/testkit.ts'
import { createLogger } from '@/lib/logger.ts'
import { syncOnce } from '@/usecases/sync.ts'
import { fakeFn } from '../helpers/fakes.ts'
import { fakeFormattedLists, makeMedia } from '../helpers/factories.ts'

function fakeMal() {
  return {
    getLists: fakeFn(() => Promise.resolve({ anime: [], manga: [] })),
    updateOne: fakeFn(() => Promise.resolve(undefined)),
    deleteOne: fakeFn(() => Promise.resolve(undefined)),
  }
}
const logger = createLogger({ json: false, quiet: true, verbose: false })

describe('syncOnce', () => {
  it('dryRun does zero writes', async () => {
    const anime = [makeMedia({ type: 'anime', id: 1 })]
    const fmt = fakeFormattedLists(anime, [])
    const anilist = { getLists: fakeFn(() => Promise.resolve(fmt)) } as never
    const mal = fakeMal() as never
    const res = await syncOnce(
      { anilist, mal },
      {
        anilistUsername: 'U',
        prune: false,
        dryRun: true,
        concurrency: 5,
        excludes: new Set(),
        logger,
      },
    )
    expect((mal as { updateOne: { calls: unknown[][] } }).updateOne.calls).toHaveLength(0)
    expect((mal as { deleteOne: { calls: unknown[][] } }).deleteOne.calls).toHaveLength(0)
    expect(res.diff.anime.update).toHaveLength(1)
  })

  it('prune false does zero deletes even with extras', async () => {
    const fmt = fakeFormattedLists([], [])
    const anilist = { getLists: fakeFn(() => Promise.resolve(fmt)) } as never
    const mal = {
      getLists: fakeFn(() =>
        Promise.resolve({ anime: [makeMedia({ type: 'anime', id: 99 })], manga: [] })
      ),
      updateOne: fakeFn(() => Promise.resolve(undefined)),
      deleteOne: fakeFn(() => Promise.resolve(undefined)),
    } as never
    await syncOnce(
      { anilist, mal },
      {
        anilistUsername: 'U',
        prune: false,
        dryRun: false,
        concurrency: 5,
        excludes: new Set(),
        logger,
      },
    )
    expect((mal as { deleteOne: { calls: unknown[][] } }).deleteOne.calls).toHaveLength(0)
  })

  it('only anime excludes manga partition', async () => {
    const anime = [makeMedia({ type: 'anime', id: 1 })]
    const manga = [makeMedia({ type: 'manga', id: 101 })]
    const fmt = fakeFormattedLists(anime, manga)
    const anilist = { getLists: fakeFn(() => Promise.resolve(fmt)) } as never
    const mal = fakeMal() as never
    await syncOnce(
      { anilist, mal },
      {
        anilistUsername: 'U',
        prune: false,
        dryRun: false,
        concurrency: 5,
        excludes: new Set(),
        only: 'anime',
        logger,
      },
    )
    const calls = (mal as unknown as { updateOne: { calls: unknown[][] } }).updateOne.calls
    expect(calls).toHaveLength(1)
    const firstCall = calls[0]
    if (!firstCall) throw new Error('expected exactly one update call')
    const arg = firstCall[0] as { type: string }
    expect(arg.type).toBe('anime')
  })

  it('one rejected update among five → failed 1, others applied', async () => {
    const anime = Array.from({ length: 5 }, (_, i) => makeMedia({ type: 'anime', id: i + 1 }))
    const fmt = fakeFormattedLists(anime, [])
    const anilist = { getLists: fakeFn(() => Promise.resolve(fmt)) } as never
    const mal = {
      getLists: fakeFn(() => Promise.resolve({ anime: [], manga: [] })),
      updateOne: fakeFn((args: unknown[]) => {
        const m = args[0] as { id: number }
        if (m.id === 3) return Promise.reject(new Error('fail 3'))
        return Promise.resolve(undefined)
      }),
      deleteOne: fakeFn(() => Promise.resolve(undefined)),
    } as never
    const res = await syncOnce(
      { anilist, mal },
      {
        anilistUsername: 'U',
        prune: false,
        dryRun: false,
        concurrency: 5,
        excludes: new Set(),
        logger,
      },
    )
    expect(res.failed).toHaveLength(1)
    expect(res.applied).toHaveLength(4)
  })
})
