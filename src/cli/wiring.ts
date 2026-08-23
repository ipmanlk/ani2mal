import { AnilistClient } from '@/api/anilist/client.ts'
import { MalClient } from '@/api/mal/client.ts'
import { TokenProviderImpl } from '@/auth/token-provider.ts'
import type { Config, Token } from '@/config/schema.ts'
import { ConfigSchema, ExcludesSchema, TokenSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'
import { type MalId, malId } from '@/domain/media.ts'
import { ConfigError } from '@/lib/errors.ts'

export interface SyncContext {
  cfg: Config & { anilist: { username: string }; mal: { clientId: string } }
  excludes: ReadonlySet<MalId>
  anilist: AnilistClient
  mal: MalClient
}

// Everything sync and watch need: validated config + token presence, exclude
// set, and wired API clients sharing one token provider.
export async function loadSyncContext(dir: string, signal?: AbortSignal): Promise<SyncContext> {
  const configStore = new JsonFileStore<Config>(dir, 'config.json', ConfigSchema)
  const cfg = await configStore.load()
  if (cfg?.anilist.username === undefined) {
    throw new ConfigError(
      'anilist.username is required — run: ani2mal config set anilist.username=...',
    )
  }
  if (cfg.mal.clientId === undefined) {
    throw new ConfigError('mal.clientId is required — run: ani2mal config set mal.clientId=...')
  }

  const tokenStore = new JsonFileStore<Token>(dir, 'mal_token.json', TokenSchema)
  if ((await tokenStore.load()) === undefined) {
    throw new ConfigError(`Not logged in. Run: ani2mal login\n  Config dir: ${dir}`)
  }

  const excludesStore = new JsonFileStore<number[]>(dir, 'excludes.json', ExcludesSchema)
  const excludes = new Set(((await excludesStore.load()) ?? []).map(malId))

  return {
    cfg: cfg as SyncContext['cfg'],
    excludes,
    anilist: new AnilistClient(globalThis.fetch),
    mal: new MalClient(
      globalThis.fetch,
      new TokenProviderImpl(tokenStore, cfg, globalThis.fetch, signal),
    ),
  }
}
