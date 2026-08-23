import { ExcludesSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'
import { ConfigError } from '@/lib/errors.ts'
import type { Router } from '@/cli/router.ts'

export function registerExcludeCommands(router: Router, getDir: () => string): void {
  router.add({
    name: 'exclude',
    description: 'Manage manual exclude list',
    subcommands: [
      {
        name: 'list',
        description: 'List excluded MAL ids',
        run: async () => {
          const dir = getDir()
          const store = new JsonFileStore<number[]>(dir, 'excludes.json', ExcludesSchema)
          const list = (await store.load()) ?? []
          for (const id of list) process.stdout.write(`${id}\n`)
          if (list.length === 0) process.stdout.write('(empty)\n')
        },
      },
      {
        name: 'add',
        description: 'Add ids to exclude list',
        args: [{ name: 'ids', variadic: true }],
        run: async ({ args }) => {
          const dir = getDir()
          const store = new JsonFileStore<number[]>(dir, 'excludes.json', ExcludesSchema)
          const current = new Set<number>((await store.load()) ?? [])
          for (const raw of args) {
            const n = Number(raw)
            if (!Number.isInteger(n) || n <= 0) {
              throw new ConfigError(`Invalid id "${raw}": expected positive integer`)
            }
            current.add(n)
          }
          await store.save([...current])
        },
      },
      {
        name: 'rm',
        description: 'Remove ids from exclude list',
        args: [{ name: 'ids', variadic: true }],
        run: async ({ args }) => {
          const dir = getDir()
          const store = new JsonFileStore<number[]>(dir, 'excludes.json', ExcludesSchema)
          const current = new Set<number>((await store.load()) ?? [])
          for (const raw of args) {
            const n = Number(raw)
            if (!Number.isInteger(n) || n <= 0) {
              throw new ConfigError(`Invalid id "${raw}": expected positive integer`)
            }
            current.delete(n)
          }
          await store.save([...current])
        },
      },
    ],
  })
}
