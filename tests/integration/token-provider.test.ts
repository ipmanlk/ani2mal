import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '../helpers/testkit.ts'
import { TokenProviderImpl } from '@/auth/token-provider.ts'
import { TokenSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'
import { jsonRes, makeFetch, type Route } from '../helpers/fake-fetch.ts'

function tokenRoutes(onCall: () => void): Route[] {
  return [
    {
      method: 'POST',
      pattern: 'https://myanimelist.net/v1/oauth2/token',
      respond: async () => {
        onCall()
        await new Promise((r) => setTimeout(r, 20))
        return jsonRes({
          access_token: 'new_access12345',
          refresh_token: 'new_refresh12345',
          token_type: 'Bearer',
          expires_in: 3600,
        })
      },
    },
  ]
}

describe('TokenProvider', () => {
  it('single-flight coalesces concurrent refresh', async () => {
    let tokenCalls = 0
    const fetchImpl = makeFetch(tokenRoutes(() => tokenCalls++))
    const dir = await mkdtemp(path.join(tmpdir(), 'tok-'))
    try {
      const store = new JsonFileStore(dir, 'mal_token.json', TokenSchema)
      const expiring = {
        access_token: 'old_access12345',
        refresh_token: 'old_refresh12345',
        token_type: 'Bearer' as const,
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
      }
      await store.save(expiring)
      const cfg = { anilist: {}, mal: { clientId: '12345678' } } as never
      const tp = new TokenProviderImpl(store, cfg, fetchImpl)
      const [a, b] = await Promise.all([tp.getAccessToken(), tp.getAccessToken()])
      expect(a).toBe('new_access12345')
      expect(b).toBe('new_access12345')
      expect(tokenCalls).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('proactive refresh when expiring in 30s, not when 10min', async () => {
    let calls = 0
    const fetchImpl = makeFetch(tokenRoutes(() => calls++))
    const dir = await mkdtemp(path.join(tmpdir(), 'tok-'))
    try {
      const store = new JsonFileStore(dir, 'mal_token.json', TokenSchema)
      // expiring in 30s => should refresh
      await store.save({
        access_token: 'old_access12345',
        refresh_token: 'old_refresh12345',
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
      })
      const cfg = { anilist: {}, mal: { clientId: '12345678' } } as never
      const tp = new TokenProviderImpl(store, cfg, fetchImpl)
      await tp.getAccessToken()
      expect(calls).toBe(1)
      // reset for far future
      calls = 0
      await store.save({
        access_token: 'old_access12345',
        refresh_token: 'old_refresh12345',
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      const tp2 = new TokenProviderImpl(store, cfg, fetchImpl)
      await tp2.getAccessToken()
      expect(calls).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
