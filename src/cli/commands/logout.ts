import type { PkceData, Token } from '@/config/schema.ts'
import { PkceSchema, TokenSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'
import type { Logger } from '@/lib/logger.ts'
import type { Router } from '@/cli/router.ts'

export function registerLogoutCommand(
  router: Router,
  getDir: () => string,
  getLogger: () => Logger,
): void {
  router.add({
    name: 'logout',
    description: 'Delete token and PKCE files',
    run: async () => {
      const dir = getDir()
      const logger = getLogger()
      const tokenStore = new JsonFileStore<Token>(dir, 'mal_token.json', TokenSchema)
      const pkceStore = new JsonFileStore<PkceData>(dir, 'pkce.json', PkceSchema)
      await tokenStore.delete()
      await pkceStore.delete()
      logger.info(`Logged out. Config dir: ${dir}`)
      logger.info('Run ani2mal login to reconnect.')
    },
  })
}
