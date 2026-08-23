import { describe, expect, it } from '../helpers/testkit.ts'
import type { MalId } from '@/domain/media.ts'
import { createLogger } from '@/lib/logger.ts'
import { watchLoop } from '@/usecases/watch.ts'
import { fakeFn } from '../helpers/fakes.ts'
import { fakeFormattedLists } from '../helpers/factories.ts'

const logger = createLogger({ json: false, quiet: true, verbose: false })

function makeDeps(intervalMs: number, signal: AbortSignal) {
  const fmt = fakeFormattedLists([], [])
  const anilist = { getLists: fakeFn(() => Promise.resolve(fmt)) } as never
  const mal = {
    getLists: fakeFn(() => Promise.resolve({ anime: [], manga: [] })),
    updateOne: fakeFn(() => Promise.resolve(undefined)),
    deleteOne: fakeFn(() => Promise.resolve(undefined)),
  } as never
  const opts = {
    anilistUsername: 'U',
    prune: false,
    dryRun: false,
    concurrency: 5,
    excludes: new Set<MalId>(),
    logger,
    intervalMs,
  }
  return { run: () => watchLoop({ anilist, mal }, opts, signal), anilist }
}

describe('watchLoop', () => {
  it('interval 0 runs exactly once', async () => {
    const { run, anilist } = makeDeps(0, new AbortController().signal)
    await run()
    expect((anilist as { getLists: { calls: unknown[][] } }).getLists.calls).toHaveLength(1)
  })

  it('pre-aborted signal does zero iterations', async () => {
    const c = new AbortController()
    c.abort()
    const { run, anilist } = makeDeps(1000, c.signal)
    await expect(run()).rejects.toThrow()
    expect((anilist as { getLists: { calls: unknown[][] } }).getLists.calls).toHaveLength(0)
  })

  it('abort during sleep resolves before next tick', async () => {
    const c = new AbortController()
    const { run, anilist } = makeDeps(5000, c.signal)
    // after the first tick it sleeps for 5s; aborting after 20ms ends the loop
    setTimeout(() => c.abort(), 20)
    await run()
    expect((anilist as { getLists: { calls: unknown[][] } }).getLists.calls).toHaveLength(1)
  })
})
