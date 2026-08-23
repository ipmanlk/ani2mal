export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

const REDACT_RE = /(secret|token|authorization|code_verifier|password)/i

export function redactForLogs(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((v) => redactForLogs(v))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_RE.test(k) ? '***' : redactForLogs(v)
    }
    return out
  }
  return value
}

function color(code: number, text: string): string {
  return process.stderr.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text
}

export function createLogger(opts: { json: boolean; quiet: boolean; verbose: boolean }): Logger {
  const write = (level: string, msg: string, fields?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    if (opts.json) {
      const rec = {
        level,
        msg,
        ts,
        ...((fields ? redactForLogs(fields) : {}) as Record<string, unknown>),
      }
      process.stderr.write(`${JSON.stringify(rec)}\n`)
    } else {
      const redacted = fields ? redactForLogs(fields) : undefined
      const extra = redacted && Object.keys(redacted as object).length > 0
        ? ` ${JSON.stringify(redacted)}`
        : ''
      process.stderr.write(`${msg}${extra}\n`)
    }
  }

  return {
    debug(msg, fields) {
      if (!opts.verbose || opts.quiet) return
      write('debug', msg, fields)
    },
    info(msg, fields) {
      if (opts.quiet) return
      write('info', msg, fields)
    },
    success(msg) {
      if (!opts.quiet && !opts.json) process.stderr.write(`${color(32, '✓')} ${msg}\n`)
      else if (!opts.quiet) write('info', msg)
    },
    warn(msg) {
      if (opts.json) write('warn', msg)
      else process.stderr.write(`${color(33, '⚠')} ${msg}\n`)
    },
    error(msg) {
      if (opts.json) write('error', msg)
      else process.stderr.write(`${color(31, '✖')} ${msg}\n`)
    },
  }
}
