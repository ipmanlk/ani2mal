import { mkdtemp, rm, stat } from 'node:fs/promises'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '../helpers/testkit.ts'
import { resolveConfigDir } from '@/config/paths.ts'
import { ConfigSchema, ExcludesSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'

// These tests mutate process.env and process.platform; every case restores
// both when it finishes.
function withCleanEnv(fn: () => void): () => void {
  return () => {
    const origEnv = { ...process.env }
    const origPlatform = process.platform
    try {
      fn()
    } finally {
      process.env = { ...origEnv }
      Object.defineProperty(process, 'platform', { value: origPlatform })
    }
  }
}

describe('resolveConfigDir', () => {
  it(
    '--config-dir wins',
    withCleanEnv(() => {
      expect(resolveConfigDir('/tmp/custom')).toBe(path.resolve('/tmp/custom'))
    }),
  )
  it(
    'ANI2MAL_CONFIG_DIR env',
    withCleanEnv(() => {
      process.env.ANI2MAL_CONFIG_DIR = '/tmp/envdir'
      expect(resolveConfigDir(undefined)).toBe(path.resolve('/tmp/envdir'))
    }),
  )
  it(
    'XDG_CONFIG_HOME',
    withCleanEnv(() => {
      delete process.env.ANI2MAL_CONFIG_DIR
      process.env.XDG_CONFIG_HOME = '/custom'
      expect(resolveConfigDir(undefined)).toBe(path.join('/custom', 'ani2mal'))
    }),
  )
  it(
    'darwin default',
    withCleanEnv(() => {
      delete process.env.ANI2MAL_CONFIG_DIR
      delete process.env.XDG_CONFIG_HOME
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(resolveConfigDir(undefined)).toBe(
        path.join(os.homedir(), 'Library', 'Application Support', 'ani2mal'),
      )
    }),
  )
  it(
    'linux default',
    withCleanEnv(() => {
      delete process.env.ANI2MAL_CONFIG_DIR
      delete process.env.XDG_CONFIG_HOME
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(resolveConfigDir(undefined)).toBe(path.join(os.homedir(), '.config', 'ani2mal'))
    }),
  )
})

describe('JsonFileStore', () => {
  it('save and load', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-store-'))
    try {
      const store = new JsonFileStore(dir, 'config.json', ConfigSchema)
      const cfg = { anilist: { username: 'Test' }, mal: { clientId: '12345678' } }
      await store.save(cfg as never)
      const loaded = await store.load()
      expect(loaded).toEqual(cfg)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('corrupt JSON throws ConfigError', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-store-'))
    try {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(path.join(dir, 'config.json'), '{ invalid json', 'utf8')
      const store = new JsonFileStore(dir, 'config.json', ConfigSchema)
      await expect(store.load()).rejects.toThrow(/Invalid config\.json/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('missing file returns undefined', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-store-'))
    try {
      const store = new JsonFileStore(dir, 'config.json', ConfigSchema)
      expect(await store.load()).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('saved file is 0600', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-store-'))
    try {
      const store = new JsonFileStore(dir, 'config.json', ConfigSchema)
      await store.save({ anilist: {}, mal: { clientId: '12345678' } } as never)
      const st = await stat(path.join(dir, 'config.json'))
      // On Windows chmod may not apply, but on linux should be 0o600
      if (process.platform !== 'win32') {
        expect(st.mode & 0o777).toBe(0o600)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('excludes store', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-store-'))
    try {
      const store = new JsonFileStore<number[]>(dir, 'excludes.json', ExcludesSchema)
      await store.save([1, 2, 3])
      expect(await store.load()).toEqual([1, 2, 3])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
