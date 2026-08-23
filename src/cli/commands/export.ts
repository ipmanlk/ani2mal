import path from 'node:path'
import { AnilistClient } from '@/api/anilist/client.ts'
import type { Config } from '@/config/schema.ts'
import { ConfigSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'
import { ConfigError } from '@/lib/errors.ts'
import type { Logger } from '@/lib/logger.ts'
import { exportLists } from '@/usecases/export.ts'
import type { Router } from '@/cli/router.ts'

export function registerExportCommand(
  router: Router,
  getDir: () => string,
  getLogger: () => Logger,
  getSignal: () => AbortSignal | undefined,
): void {
  router.add({
    name: 'export',
    description: 'Fetch AniList and write MAL-compatible XML (no MAL auth)',
    options: [
      { name: 'username', value: true, description: 'AniList username' },
      { name: 'mal-username', value: true, description: 'MAL account name for XML <user_name>' },
      { name: 'type', value: true, description: 'Which lists (anime|manga|both)', default: 'both' },
      { name: 'out', value: true, description: 'Output directory', default: '.' },
      { name: 'force', description: 'Overwrite existing files', default: false },
    ],
    run: async ({ opts }) => {
      const dir = getDir()
      const logger = getLogger()
      const signal = getSignal()

      let username = opts.username as string | undefined
      if (username === undefined) {
        const store = new JsonFileStore<Config>(dir, 'config.json', ConfigSchema)
        const cfg = await store.load()
        username = cfg?.anilist.username
        if (username === undefined) {
          throw new ConfigError(
            'Provide --username or run: ani2mal config set anilist.username=...',
          )
        }
      }

      const type = opts.type as 'anime' | 'manga' | 'both'
      if (!['anime', 'manga', 'both'].includes(type)) {
        throw new ConfigError(`Invalid --type "${type}": expected anime|manga|both`)
      }

      const outDir = path.resolve(String(opts.out))
      const anilist = new AnilistClient(globalThis.fetch)

      const exportOpts: {
        username: string
        type: 'anime' | 'manga' | 'both'
        outDir: string
        force: boolean
        malUsername?: string
      } = {
        username,
        type,
        outDir,
        force: opts.force === true,
      }
      if (opts.malUsername !== undefined) exportOpts.malUsername = String(opts.malUsername)

      const result = await exportLists(anilist, exportOpts, signal)

      for (const f of result.files) {
        logger.success(`Wrote ${f}`)
      }
      if (result.skippedNoMalId > 0) logger.info(`${result.skippedNoMalId} skipped: no MAL id`)
      if (result.skippedUnknownStatus > 0) {
        logger.warn(`${result.skippedUnknownStatus} skipped: unresolvable list status`)
      }
    },
  })
}
