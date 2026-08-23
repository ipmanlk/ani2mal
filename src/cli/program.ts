import type { Logger } from '@/lib/logger.ts'
import { registerConfigCommands } from './commands/config.ts'
import { registerExcludeCommands } from './commands/exclude.ts'
import { registerExportCommand } from './commands/export.ts'
import { registerLoginCommand } from './commands/login.ts'
import { registerLogoutCommand } from './commands/logout.ts'
import { registerSyncCommand } from './commands/sync.ts'
import { registerWatchCommand } from './commands/watch.ts'
import { type GlobalFlags, Router } from './router.ts'
import version from '@/version.json' with { type: 'json' }

export const VERSION = version.version

export interface ProgramDeps {
  logger: Logger
  signal: AbortSignal
  dir: string
}

export interface Program {
  parse: (argv: string[]) => ReturnType<Router['parse']>
  run: (argv: string[]) => Promise<GlobalFlags>
}

export function createProgram(deps: ProgramDeps): Program {
  const router = new Router({
    version: VERSION,
    description: 'Keep MyAnimeList in sync with what you watch and read on AniList.',
  })

  const getDir = () => deps.dir
  const getLogger = () => deps.logger
  const getSignal = () => deps.signal
  // Global flags are only known once the router has split them off, so the
  // interactive check goes through this little box that run() fills in.
  const state = { nonInteractive: false }
  const isNonInteractive = () => state.nonInteractive

  registerConfigCommands(router, getDir)
  registerLoginCommand(router, getDir, getLogger, isNonInteractive, getSignal)
  registerLogoutCommand(router, getDir, getLogger)
  registerExportCommand(router, getDir, getLogger, getSignal)
  registerSyncCommand(router, getDir, getLogger, getSignal)
  registerWatchCommand(router, getDir, getLogger, getSignal)
  registerExcludeCommands(router, getDir)

  return {
    parse: (argv) => router.parse(argv),
    run: (argv) =>
      router.run(argv, (g) => {
        state.nonInteractive = g.nonInteractive
      }),
  }
}
