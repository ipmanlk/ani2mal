import { CliError } from '@/lib/errors.ts'

// A tiny command router: turns command line tokens into options and
// positionals for the registered commands, prints help, and reports usage
// errors through CliError.

export interface OptionSpec {
  // Long name without dashes, e.g. 'dry-run' for --dry-run.
  name: string
  short?: string
  description?: string
  // Set when the option consumes the next token, e.g. --limit 3.
  value?: true
  default?: string | boolean
  // Label shown in help when it differs from --name, e.g. --no-open.
  usage?: string
}

export interface ArgSpec {
  name: string
  variadic?: boolean
}

export type OptionValue = string | boolean | undefined

export interface ActionContext {
  opts: Record<string, OptionValue>
  args: string[]
}

export interface CommandSpec {
  name: string
  description?: string
  options?: OptionSpec[]
  args?: ArgSpec[]
  subcommands?: CommandSpec[]
  run?: (ctx: ActionContext) => void | Promise<void>
}

export interface GlobalFlags {
  configDir?: string
  json: boolean
  quiet: boolean
  verbose: boolean
  nonInteractive: boolean
}

// Declared here so root help can list them; parsing happens in extractGlobals.
export const GLOBAL_OPTIONS: OptionSpec[] = [
  { name: 'config-dir', value: true, description: 'Config directory' },
  { name: 'json', description: 'Machine-readable output', default: false },
  { name: 'quiet', description: 'Errors only', default: false },
  { name: 'verbose', description: 'Debug logs', default: false },
  { name: 'non-interactive', description: 'Never prompt', default: false },
]

const HELP_FLAGS = new Set(['--help', '-h'])
const VERSION_FLAGS = new Set(['--version', '-V'])

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

type Resolved =
  | { kind: 'help'; text: string }
  | { kind: 'run'; spec: CommandSpec; opts: Record<string, OptionValue>; args: string[] }

export class Router {
  readonly version: string
  private description: string
  private globals: OptionSpec[]
  private commands: CommandSpec[] = []

  constructor(opts: { version: string; description: string }) {
    this.version = opts.version
    this.description = opts.description
    this.globals = GLOBAL_OPTIONS
  }

  add(spec: CommandSpec): void {
    this.commands.push(spec)
  }

  // Splits global flags off argv and parses what is left. Pure inspection:
  // nothing is printed and no action runs. Used by tests.
  parse(argv: string[]): { globals: GlobalFlags; rest: string[]; resolved?: Resolved } {
    const { globals, rest } = extractGlobals(argv)
    if (rest.length === 0 || HELP_FLAGS.has(rest[0] ?? '')) {
      return { globals, rest, resolved: { kind: 'help', text: this.rootHelp() } }
    }
    if (VERSION_FLAGS.has(rest[0] ?? '')) return { globals, rest }

    const first = rest[0] ?? ''
    if (first === 'help') {
      // Accept both `help config get` and `help config.get`.
      const target = rest.slice(1).join('.') || undefined
      const found = target ? this.findPath(this.commands, target.split('.')) : undefined
      if (target && !found) throw new CliError(`unknown command '${target}'`)
      return {
        globals,
        rest,
        resolved: {
          kind: 'help',
          text: found ? this.commandHelp(found.spec, found.path) : this.rootHelp(),
        },
      }
    }

    // A leading flag that survived global extraction can only be a typo.
    if (first.startsWith('-') && !HELP_FLAGS.has(first) && !VERSION_FLAGS.has(first)) {
      throw new CliError(`unknown option '${first}'`)
    }

    const top = this.commands.find((c) => c.name === first)
    if (!top) throw new CliError(`unknown command '${first}'`)
    return { globals, rest, resolved: this.resolve(top, [top.name], rest.slice(1)) }
  }

  // Full run of one invocation. Help and version requests print to stdout and
  // return normally; usage errors throw CliError (exit code 2). onDispatch
  // fires just before an action runs so login can read the global flags.
  async run(
    argv: string[],
    onDispatch?: (g: GlobalFlags) => void,
  ): Promise<GlobalFlags> {
    const { globals, resolved } = this.parse(argv)

    if (!resolved) {
      // Only --version lands here; empty argv and --help become help text.
      process.stdout.write(`${this.version}\n`)
      return globals
    }
    if (resolved.kind === 'help') {
      process.stdout.write(resolved.text)
      return globals
    }
    onDispatch?.(globals)
    await resolved.spec.run?.({ opts: resolved.opts, args: resolved.args })
    return globals
  }

  private findPath(
    specs: CommandSpec[],
    parts: string[],
  ): { spec: CommandSpec; path: string[] } | undefined {
    const head = parts[0]
    if (head === undefined) return undefined
    const tail = parts.slice(1)
    const spec = specs.find((c) => c.name === head)
    if (!spec) return undefined
    // Rebuild the full path on the way out so help shows every ancestor.
    if (tail.length > 0 && spec.subcommands) {
      const inner = this.findPath(spec.subcommands, tail)
      if (!inner) return undefined
      return { spec: inner.spec, path: [head, ...inner.path] }
    }
    if (tail.length > 0) return undefined
    return { spec, path: [head] }
  }

  private resolve(spec: CommandSpec, path: string[], tokens: string[]): Resolved {
    // Walk down into subcommands while the next token names one.
    while (spec.subcommands) {
      const next = spec.subcommands.find((s) => s.name === tokens[0])
      if (!next) break
      spec = next
      path = [...path, next.name]
      tokens = tokens.slice(1)
    }

    // A help flag applies to whatever command context we ended up in.
    if (tokens.some((t) => HELP_FLAGS.has(t))) {
      return { kind: 'help', text: this.commandHelp(spec, path) }
    }

    // Still holding unmatched tokens under a parent means a bad subcommand.
    if (spec.subcommands && tokens.length > 0) {
      const names = spec.subcommands.map((s) => s.name).join(', ')
      throw new CliError(`unknown subcommand '${tokens[0] ?? ''}' — expected one of: ${names}`)
    }

    const known = [...this.globals, ...(spec.options ?? [])]
    checkUnknownTokens(tokens, known)
    const parsed = parseTokens(tokens, spec)

    const opts: Record<string, OptionValue> = {}
    for (const opt of spec.options ?? []) {
      opts[kebabToCamel(opt.name)] = parsed.flags[opt.name]
    }

    // Every declared argument slot needs at least one token.
    const positional = parsed.positional
    const argSpecs = spec.args ?? []
    const missing = positional.length < argSpecs.length ? argSpecs[positional.length] : undefined
    if (missing) throw new CliError(`missing required argument '${missing.name}'`)

    return { kind: 'run', spec, opts, args: positional }
  }

  printRootHelp(): void {
    process.stdout.write(this.rootHelp())
  }

  rootHelp(): string {
    const width = longest(this.commands.map((c) => c.name))
    const rows = this.commands.map(
      (c) => `  ${pad(c.name, width)}${c.description ?? ''}`,
    )
    return [
      'Usage: ani2mal [options] [command]',
      '',
      this.description,
      '',
      'Options:',
      ...optionRows(this.globals),
      '  -V, --version            Print version',
      '  -h, --help               Show help',
      '',
      'Commands:',
      ...rows,
      `  ${pad('help', width)}Show help for a command`,
      '',
    ].join('\n')
  }

  commandHelp(spec: CommandSpec, path: string[]): string {
    const argsPart = (spec.args ?? [])
      .map((a) => `<${a.name}>${a.variadic ? '...' : ''}`)
      .join(' ')
    const lines: string[] = [
      `Usage: ani2mal ${path.join(' ')}${(spec.options ?? []).length > 0 ? ' [options]' : ''}${
        argsPart ? ` ${argsPart}` : ''
      }`,
    ]
    if (spec.subcommands) {
      lines.push('', 'Commands:')
      const width = longest(spec.subcommands.map((s) => s.name))
      for (const sub of spec.subcommands) {
        lines.push(`  ${pad(sub.name, width)}${sub.description ?? ''}`)
      }
    }
    if (spec.description) lines.push('', spec.description)
    if ((spec.options ?? []).length > 0) {
      lines.push(
        '',
        'Options:',
        ...optionRows(spec.options ?? []),
        '  -h, --help               Show help',
      )
    }
    return `${lines.join('\n')}\n`
  }
}

function optionRow(o: OptionSpec): string {
  const label = o.usage ?? (o.value ? `--${o.name} <value>` : `--${o.name}`)
  const suffix = typeof o.default === 'string' ? ` (default: "${o.default}")` : ''
  return `  ${pad(label, 24)}${o.description ?? ''}${suffix}`
}

function optionRows(opts: OptionSpec[]): string[] {
  return opts.map(optionRow)
}

function pad(s: string, n: number): string {
  return s.padEnd(n + 2)
}

function longest(names: string[]): number {
  return names.reduce((m, n) => Math.max(m, n.length), 0)
}

// Turns raw tokens into flags and positionals for one command. Long flags,
// short aliases, --flag=value, negation via --no-x and value consumption are
// all supported. Unknown flags never reach this point; checkUnknownTokens has
// already rejected them.
function parseTokens(
  tokens: string[],
  spec: CommandSpec,
): { flags: Record<string, string | boolean>; positional: string[] } {
  const options = spec.options ?? []
  const findOpt = (name: string) => options.find((o) => o.name === name || o.short === name)
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  // Set when the previous token was a value flag still waiting for its value.
  let pendingValue: string | undefined
  for (const tok of tokens) {
    if (pendingValue !== undefined) {
      flags[pendingValue] = tok
      pendingValue = undefined
      continue
    }
    if (!tok.startsWith('-') || tok === '-') {
      positional.push(tok)
      continue
    }
    if (HELP_FLAGS.has(tok)) continue

    let name: string
    let inlineValue: string | undefined
    if (tok.startsWith('--')) {
      const body = tok.slice(2)
      const eq = body.indexOf('=')
      if (eq !== -1) {
        name = body.slice(0, eq)
        inlineValue = body.slice(eq + 1)
      } else {
        name = body
      }
    } else {
      name = tok.slice(1)
    }

    // --no-open flips the boolean named 'open'. Option names in this CLI never
    // start with "no-", so the prefix is unambiguous.
    const isNegation = name.startsWith('no-')
    const base = isNegation ? name.slice(3) : name
    const opt = findOpt(base)

    if (!opt) continue
    if (opt.value) {
      if (inlineValue !== undefined) flags[base] = inlineValue
      else {
        pendingValue = base
        flags[base] = ''
      }
    } else {
      flags[base] = !isNegation
    }
  }

  // Registered defaults fill in whatever the user left out.
  for (const opt of options) {
    if (!(opt.name in flags) && opt.default !== undefined) flags[opt.name] = opt.default
  }
  return { flags, positional }
}

// Rejects anything that looks like a flag but was never registered. Value
// flags swallow the token that follows them unless written as --flag=value.
function checkUnknownTokens(tokens: string[], known: OptionSpec[]): void {
  const longNames = new Set(known.map((o) => o.name))
  const shortNames = new Set(known.map((o) => o.short).filter(Boolean) as string[])
  const valueFlags = new Set(known.filter((o) => o.value).map((o) => o.name))
  const negatable = new Set(
    known.filter((o) => !o.value && o.default === true).map((o) => o.name),
  )

  let skipNext = false
  for (const tok of tokens) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (!tok.startsWith('-')) continue
    // --version only means something ahead of the command name; here it is
    // just an unregistered flag.
    if (HELP_FLAGS.has(tok)) continue
    if (VERSION_FLAGS.has(tok)) throw new CliError(`unknown option '${tok}'`)

    const eq = tok.indexOf('=')
    const hasInlineValue = tok.includes('=') && tok.startsWith('--')
    const bare = eq === -1 ? tok.replace(/^--?/, '') : tok.slice(2, eq)

    if (tok.startsWith('--no-')) {
      const rest = tok.slice(5)
      const base = rest.includes('=') ? rest.slice(0, rest.indexOf('=')) : rest
      if (!negatable.has(base)) throw new CliError(`unknown option '${tok}'`)
      continue
    }

    const matchesLong = longNames.has(bare)
    const matchesShort = !tok.startsWith('--') && shortNames.has(bare)
    if (!matchesLong && !matchesShort) throw new CliError(`unknown option '${tok}'`)
    if (hasInlineValue) continue
    if (matchesLong && valueFlags.has(bare)) skipNext = true
  }
}

// Pulls the five global flags out of raw argv wherever they appear; everything
// else keeps its original order.
function extractGlobals(argv: string[]): { globals: GlobalFlags; rest: string[] } {
  const globals: GlobalFlags = {
    json: false,
    quiet: false,
    verbose: false,
    nonInteractive: false,
  }
  const rest: string[] = []
  let expectValue = false
  for (const a of argv) {
    if (expectValue) {
      globals.configDir = a
      expectValue = false
      continue
    }
    if (a === '--config-dir') {
      expectValue = true
      continue
    }
    if (a === '--json') globals.json = true
    else if (a === '--quiet') globals.quiet = true
    else if (a === '--verbose') globals.verbose = true
    else if (a === '--non-interactive') globals.nonInteractive = true
    else rest.push(a)
  }
  return { globals, rest }
}
