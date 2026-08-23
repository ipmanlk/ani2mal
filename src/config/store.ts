import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as v from 'valibot'
import { ConfigError } from '@/lib/errors.ts'

function isEnoent(e: unknown): boolean {
  return e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT'
}

// Valibot path entries are plain strings and numbers for our schemas; anything
// else is a nested key object and we pull the key out of it.
function issueKey(part: unknown): string {
  if (typeof part === 'string') return part
  if (typeof part === 'number') return String(part)
  if (part !== null && typeof part === 'object' && 'key' in part) {
    return String((part as { key: unknown }).key)
  }
  return String(part)
}

export function formatIssues(issues: v.BaseIssue<unknown>[]): string {
  return issues
    .map((iss) =>
      `${
        iss.path && iss.path.length > 0 ? `.${iss.path.map(issueKey).join('.')}` : ''
      }: ${iss.message}`
    )
    .join('; ')
}

export class JsonFileStore<T> {
  constructor(
    private dir: string,
    private file: string,
    private schema: v.GenericSchema<T>,
  ) {}

  path(): string {
    return path.join(this.dir, this.file)
  }

  async load(): Promise<T | undefined> {
    let raw: string
    try {
      raw = await readFile(this.path(), 'utf8')
    } catch (e) {
      if (isEnoent(e)) return undefined
      throw new ConfigError(`Invalid ${this.file}: ${e instanceof Error ? e.message : String(e)}`)
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch (e) {
      throw new ConfigError(
        `Invalid ${this.file}: JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
      )
    }

    const result = v.safeParse(this.schema, data)
    if (!result.success) {
      throw new ConfigError(`Invalid ${this.file}: ${formatIssues(result.issues)}`)
    }
    return result.output
  }

  async save(value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const tmp = path.join(this.dir, `.${this.file}.tmp.${process.pid}`)
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, this.path())
  }

  async delete(): Promise<void> {
    try {
      await unlink(this.path())
    } catch (e) {
      if (!isEnoent(e)) throw e
    }
  }
}
