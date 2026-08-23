import type { Logger } from '@/lib/logger.ts'
import { watchLoop } from '@/usecases/watch.ts'
import { parseInterval, parseLimit, parseOnly } from '@/cli/options.ts'
import type { Router } from '@/cli/router.ts'
import { loadSyncContext } from '@/cli/wiring.ts'

export function registerWatchCommand(
  router: Router,
  getDir: () => string,
  getLogger: () => Logger,
  getSignal: () => AbortSignal,
): void {
  router.add({
    name: 'watch',
    description: 'Poll sync on interval',
    options: [
      {
        name: 'interval',
        value: true,
        description: 'Poll interval (e.g. 30m, 5m min, 24h max, 0=once)',
        default: '30m',
      },
      { name: 'prune', description: 'Also delete MAL items absent from AniList', default: false },
      { name: 'dry-run', description: 'Preview only', default: false },
      { name: 'only', value: true, description: 'Restrict to anime|manga' },
      { name: 'limit', value: true, description: 'Concurrent writes (1-10)', default: '5' },
    ],
    run: async ({ opts }) => {
      const logger = getLogger()
      const signal = getSignal()
      const ctx = await loadSyncContext(getDir(), signal)

      await watchLoop(
        { anilist: ctx.anilist, mal: ctx.mal },
        {
          anilistUsername: ctx.cfg.anilist.username,
          prune: opts.prune === true,
          dryRun: opts.dryRun === true,
          concurrency: parseLimit(String(opts.limit)),
          excludes: ctx.excludes,
          logger,
          only: parseOnly(opts.only as string | undefined),
          intervalMs: parseInterval(String(opts.interval)),
        },
        signal,
      )
    },
  })
}
