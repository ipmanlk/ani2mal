import { diffLists, type DiffResult } from '@/domain/diff.ts'
import type { MalId, Media, MediaType } from '@/domain/media.ts'
import { errorMessage } from '@/lib/errors.ts'
import type { Logger } from '@/lib/logger.ts'
import type { AnilistPort } from '@/ports/anilist.ts'
import type { MalPort } from '@/ports/mal.ts'

export interface SyncOptions {
  anilistUsername: string
  prune: boolean
  dryRun: boolean
  concurrency: number
  excludes: ReadonlySet<MalId>
  logger: Logger
  only?: MediaType | undefined
}

export interface SyncResult {
  diff: DiffResult
  applied: { id: MalId; type: MediaType; action: 'update' | 'delete' }[]
  failed: { id: MalId; message: string }[]
}

// Runs tasks with at most `limit` in flight; resolves when all are settled.
async function pool<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const queue = items[Symbol.iterator]()
  const worker = async (): Promise<void> => {
    for (;;) {
      const step = queue.next()
      if (step.done) return
      await run(step.value)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function syncOnce(
  deps: { anilist: AnilistPort; mal: MalPort },
  opts: SyncOptions,
  parentSignal?: AbortSignal,
): Promise<SyncResult> {
  const [ani, mal] = await Promise.all([
    deps.anilist.getLists(opts.anilistUsername, parentSignal),
    deps.mal.getLists(parentSignal),
  ])

  parentSignal?.throwIfAborted()

  const diff = diffLists(ani, mal, { excludes: opts.excludes, prune: opts.prune })

  const wants = (t: MediaType): boolean => opts.only === undefined || opts.only === t

  const work: Array<{ media: Media; action: 'update' | 'delete' }> = [
    ...(wants('anime')
      ? diff.anime.update.map((media) => ({ media, action: 'update' as const }))
      : []),
    ...(wants('anime')
      ? diff.anime.delete.map((media) => ({ media, action: 'delete' as const }))
      : []),
    ...(wants('manga')
      ? diff.manga.update.map((media) => ({ media, action: 'update' as const }))
      : []),
    ...(wants('manga')
      ? diff.manga.delete.map((media) => ({ media, action: 'delete' as const }))
      : []),
  ]

  const updateCount = diff.anime.update.length + diff.manga.update.length
  const deleteCount = diff.anime.delete.length + diff.manga.delete.length
  opts.logger.info(`changes: ${work.length} total, ${updateCount} update, ${deleteCount} delete`)

  if (opts.dryRun) return { diff, applied: [], failed: [] }

  const applied: SyncResult['applied'] = []
  const failed: SyncResult['failed'] = []

  await pool(work, opts.concurrency, async (w) => {
    try {
      if (w.action === 'update') {
        await deps.mal.updateOne(w.media, parentSignal)
      } else {
        await deps.mal.deleteOne(w.media, parentSignal)
      }
      applied.push({ id: w.media.id, type: w.media.type, action: w.action })
    } catch (err) {
      // A Ctrl-C abort is a cancel of the whole run, not a per-item failure;
      // rethrow so the caller sees CancelledError and exits 0.
      if (parentSignal?.aborted) throw err
      failed.push({ id: w.media.id, message: errorMessage(err) })
      opts.logger.warn(`✖ ${w.media.id}: ${errorMessage(err)}`)
    }
  })

  return { diff, applied, failed }
}
