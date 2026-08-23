import { PartialSyncError } from '@/lib/errors.ts'
import type { Logger } from '@/lib/logger.ts'
import { syncOnce } from '@/usecases/sync.ts'
import { parseLimit, parseOnly } from '@/cli/options.ts'
import type { Router } from '@/cli/router.ts'
import { loadSyncContext } from '@/cli/wiring.ts'

export function registerSyncCommand(
  router: Router,
  getDir: () => string,
  getLogger: () => Logger,
  getSignal: () => AbortSignal,
): void {
  router.add({
    name: 'sync',
    description: 'Diff AniList → MAL and apply updates',
    options: [
      { name: 'prune', description: 'Also delete MAL items absent from AniList', default: false },
      { name: 'dry-run', description: 'Preview diff without writes', default: false },
      { name: 'only', value: true, description: 'Restrict to anime|manga' },
      {
        name: 'limit',
        value: true,
        description: 'Concurrent MAL writes (1-10)',
        default: '5',
      },
    ],
    run: async ({ opts }) => {
      const logger = getLogger()
      const signal = getSignal()
      const ctx = await loadSyncContext(getDir(), signal)

      const result = await syncOnce(
        { anilist: ctx.anilist, mal: ctx.mal },
        {
          anilistUsername: ctx.cfg.anilist.username,
          prune: opts.prune === true,
          dryRun: opts.dryRun === true,
          concurrency: parseLimit(String(opts.limit)),
          excludes: ctx.excludes,
          logger,
          only: parseOnly(opts.only as string | undefined),
        },
        signal,
      )

      if (opts.dryRun === true) {
        process.stdout.write(
          `${
            JSON.stringify(
              {
                changes: {
                  anime: {
                    update: result.diff.anime.update.length,
                    delete: result.diff.anime.delete.length,
                  },
                  manga: {
                    update: result.diff.manga.update.length,
                    delete: result.diff.manga.delete.length,
                  },
                },
                applied: result.applied,
                failed: result.failed,
              },
              null,
              2,
            )
          }\n`,
        )
      } else if (result.failed.length > 0) {
        throw new PartialSyncError(`Partial sync: ${result.failed.length} failed`)
      }
    },
  })
}
