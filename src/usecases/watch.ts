import { abortableDelay } from '@/lib/signal.ts'
import type { AnilistPort } from '@/ports/anilist.ts'
import type { MalPort } from '@/ports/mal.ts'
import type { SyncOptions } from './sync.ts'
import { syncOnce } from './sync.ts'

export async function watchLoop(
  deps: { anilist: AnilistPort; mal: MalPort },
  opts: SyncOptions & { intervalMs: number },
  signal: AbortSignal,
): Promise<void> {
  for (;;) {
    signal.throwIfAborted()
    const result = await syncOnce(deps, opts, signal)
    if (result.failed.length > 0) {
      opts.logger.warn(`${result.failed.length} items failed; will retry next tick`)
    }
    if (opts.intervalMs === 0) return
    await abortableDelay(opts.intervalMs, signal)
    if (signal.aborted) return
  }
}
