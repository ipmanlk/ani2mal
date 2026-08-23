import type { Config } from '@/config/schema.ts'
import { ConfigSchema } from '@/config/schema.ts'
import { formatIssues, JsonFileStore } from '@/config/store.ts'
import { ConfigError } from '@/lib/errors.ts'
import { redactForLogs } from '@/lib/logger.ts'
import type { Router } from '@/cli/router.ts'
import * as v from 'valibot'

export function registerConfigCommands(router: Router, getDir: () => string): void {
  router.add({
    name: 'config',
    description: 'Manage configuration',
    subcommands: [
      {
        name: 'get',
        description: 'Print resolved config (secrets redacted)',
        run: async () => {
          const dir = getDir()
          const store = new JsonFileStore<Config>(dir, 'config.json', ConfigSchema)
          const cfg = await store.load()
          if (!cfg) {
            process.stdout.write('{}\n')
            return
          }
          const redacted = redactForLogs(cfg) as Config
          process.stdout.write(`${JSON.stringify(redacted, null, 2)}\n`)
        },
      },
      {
        name: 'set',
        description: 'Set config values (anilist.username, mal.clientId, mal.clientSecret)',
        args: [{ name: 'kv', variadic: true }],
        run: async ({ args }) => {
          const dir = getDir()
          const store = new JsonFileStore<Config>(dir, 'config.json', ConfigSchema)
          const loaded = await store.load()
          const cfg: Config = {
            anilist: { ...(loaded?.anilist ?? {}) },
            mal: { ...(loaded?.mal ?? {}) },
          }

          for (const pair of args) {
            const eq = pair.indexOf('=')
            if (eq === -1) throw new ConfigError(`Invalid assignment "${pair}": expected key=value`)
            const k = pair.slice(0, eq)
            const v = pair.slice(eq + 1)
            if (k === 'anilist.username') cfg.anilist.username = v
            else if (k === 'mal.clientId') cfg.mal.clientId = v
            else if (k === 'mal.clientSecret') cfg.mal.clientSecret = v
            else {
              throw new ConfigError(
                `Unknown config key "${k}": allowed are anilist.username, mal.clientId, mal.clientSecret`,
              )
            }
          }

          const parsed = v.safeParse(ConfigSchema, cfg)
          if (!parsed.success) {
            throw new ConfigError(`Invalid config: ${formatIssues(parsed.issues)}`)
          }
          await store.save(parsed.output)
        },
      },
      {
        name: 'path',
        description: 'Print config directory',
        run: () => {
          process.stdout.write(`${getDir()}\n`)
        },
      },
    ],
  })
}
