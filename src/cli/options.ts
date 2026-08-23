import { ConfigError } from '@/lib/errors.ts'

export function parseInterval(s: string): number {
  if (s === '0') return 0
  const m = s.match(/^(\d+)(s|m|h)?$/)
  if (!m) throw new ConfigError(`Invalid interval "${s}": expected e.g. 30m, 1h, 0`)
  const n = Number(m[1])
  const unit = m[2] ?? 'm'
  let ms: number
  if (unit === 's') ms = n * 1000
  else if (unit === 'm') ms = n * 60 * 1000
  else ms = n * 3600 * 1000
  if (ms !== 0 && ms < 5 * 60 * 1000) throw new ConfigError('Interval must be >= 5m or 0')
  if (ms > 24 * 3600 * 1000) throw new ConfigError('Interval must be <= 24h')
  return ms
}

export function parseOnly(v: string | undefined): 'anime' | 'manga' | undefined {
  if (v === undefined) return undefined
  if (v !== 'anime' && v !== 'manga') {
    throw new ConfigError(`Invalid --only "${v}": expected anime|manga`)
  }
  return v
}

export function parseLimit(v: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    throw new ConfigError(`Invalid --limit "${v}": expected 1..10`)
  }
  return n
}
