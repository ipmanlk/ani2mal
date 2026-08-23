import { resolveConfigDir } from '@/config/paths.ts'
import { CancelledError, errorMessage, toExitCode } from '@/lib/errors.ts'
import { createLogger } from '@/lib/logger.ts'
import { createProgram } from './program.ts'

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const global = parseGlobalArgs(argv)
  const logger = createLogger({ json: global.json, quiet: global.quiet, verbose: global.verbose })
  const dir = resolveConfigDir(global.configDir)

  const run = new AbortController()
  const interrupt = () => run.abort(new CancelledError('interrupted'))
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)

  try {
    // The program strips globals again while routing; this pre-pass only
    // exists so logging and the config dir are ready before any command runs.
    const program = createProgram({ logger, signal: run.signal, dir })
    await program.run(argv)
    process.exitCode = 0
  } catch (err: unknown) {
    if (err instanceof CancelledError) {
      process.exitCode = 0
      return
    }
    process.exitCode = toExitCode(err)
    logger.error(errorMessage(err))
    if (global.verbose && err instanceof Error && err.stack) {
      process.stderr.write(`${err.stack}\n`)
    }
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
}

function parseGlobalArgs(argv: string[]) {
  let configDir: string | undefined
  let json = false
  let quiet = false
  let verbose = false
  let nonInteractive = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--config-dir' && argv[i + 1]) {
      configDir = argv[i + 1]
      i++
    } else if (a === '--json') json = true
    else if (a === '--quiet') quiet = true
    else if (a === '--verbose') verbose = true
    else if (a === '--non-interactive') nonInteractive = true
  }
  return { configDir, json, quiet, verbose, nonInteractive }
}

await main()
