import { describe, expect, it } from '../helpers/testkit.ts'
import { resolveConfigDir } from '@/config/paths.ts'
import { createLogger } from '@/lib/logger.ts'
import { createProgram } from '@/cli/program.ts'
// Assert against the same file the binary reads so the test cannot drift
// from the version the release pipeline stamps.
import version from '@/version.json' with { type: 'json' }

// Swaps process.stdout.write for a collector so help/version output can be
// asserted without spawning anything.
async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = []
  const stream = process.stdout as unknown as { write: (...a: unknown[]) => boolean }
  const original = stream.write
  stream.write = (...a: unknown[]) => {
    chunks.push(String(a[0]))
    return true
  }
  try {
    await fn()
  } finally {
    stream.write = original
  }
  return chunks.join('')
}

function makeProgram() {
  const logger = createLogger({ json: false, quiet: true, verbose: false })
  const dir = resolveConfigDir('/tmp/test-cli')
  return createProgram({ logger, dir, signal: new AbortController().signal })
}

describe('CLI program', () => {
  it('root --help lists every command', async () => {
    const out = await captureStdout(() => makeProgram().run(['--help']))
    for (const name of ['config', 'login', 'logout', 'export', 'sync', 'watch', 'exclude']) {
      expect(out).toContain(name)
    }
    expect(out).toMatch(/Usage:/)
  })

  it('every command --help renders a usage line', async () => {
    for (const name of ['config', 'login', 'logout', 'export', 'sync', 'watch', 'exclude']) {
      const out = await captureStdout(() => makeProgram().run([name, '--help']))
      expect(out).toContain(`Usage: ani2mal ${name}`)
    }
  })

  it('subcommand help renders the full path', async () => {
    const out = await captureStdout(() => makeProgram().run(['config', 'get', '--help']))
    expect(out).toContain('Usage: ani2mal config get')
    const viaHelp = await captureStdout(() => makeProgram().run(['help', 'config', 'get']))
    expect(viaHelp).toContain('Usage: ani2mal config get')
  })

  it('sync --help shows its flags', async () => {
    const out = await captureStdout(() => makeProgram().run(['sync', '--help']))
    expect(out).toContain('--prune')
    expect(out).toContain('--dry-run')
    expect(out).toContain('--only')
    expect(out).toContain('--limit')
  })

  it('--version prints the version', async () => {
    const out = await captureStdout(() => makeProgram().run(['--version']))
    expect(out.trim()).toBe(version.version)
  })

  it('legacy flags are rejected as unknown options', async () => {
    for (const flag of ['--set-user', '--set-client', '--export', '--sync', '--watch', '--login']) {
      await expect(makeProgram().run([flag])).rejects.toThrow(/unknown option/)
    }
  })

  it('unknown option on a subcommand is rejected', async () => {
    await expect(makeProgram().run(['sync', '--bogus'])).rejects.toThrow(/unknown option/)
  })

  it('unknown command exits with a clear error', async () => {
    await expect(makeProgram().run(['bogus'])).rejects.toThrow(/unknown command/)
  })

  it('missing required arguments are reported', async () => {
    await expect(makeProgram().run(['exclude', 'add'])).rejects.toThrow(
      /missing required argument/,
    )
    await expect(makeProgram().run(['config', 'set'])).rejects.toThrow(
      /missing required argument/,
    )
  })

  it('unknown subcommand under config lists the valid ones', async () => {
    await expect(makeProgram().run(['config', 'bogus'])).rejects.toThrow(/unknown subcommand/)
  })

  it('--non-interactive lands in the parsed globals', () => {
    const program = makeProgram()
    const { globals } = program.parse(['--non-interactive', 'config', 'path'])
    expect(globals.nonInteractive).toBe(true)
  })

  it('global flags are stripped before routing', () => {
    const program = makeProgram()
    const { rest } = program.parse(['--json', '--quiet', 'sync', '--dry-run'])
    expect(rest).toEqual(['sync', '--dry-run'])
  })

  it('--config-dir consumes its value', () => {
    const program = makeProgram()
    const { globals, rest } = program.parse(['--config-dir', '/tmp/x', 'config', 'path'])
    expect(globals.configDir).toBe('/tmp/x')
    expect(rest).toEqual(['config', 'path'])
  })
})
