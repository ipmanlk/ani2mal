import { createInterface } from 'node:readline/promises'
import { exchangeToken } from '@/auth/oauth.ts'
import { buildAuthorizeUrl, generateVerifier } from '@/auth/pkce.ts'
import type { Config, PkceData, Token } from '@/config/schema.ts'
import { ConfigSchema, PkceSchema, TokenSchema } from '@/config/schema.ts'
import { JsonFileStore } from '@/config/store.ts'
import { AuthError, ConfigError } from '@/lib/errors.ts'
import type { Logger } from '@/lib/logger.ts'
import type { Router } from '@/cli/router.ts'

async function askCode(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question('Paste the authorization code\n> ')).trim()
  } finally {
    rl.close()
  }
}

async function openBrowser(url: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  const cmd = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
    ? 'cmd'
    : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  await new Promise<void>((resolve) => {
    execFile(cmd, args, () => resolve())
  })
}

export function registerLoginCommand(
  router: Router,
  getDir: () => string,
  getLogger: () => Logger,
  isNonInteractive: () => boolean,
  getSignal: () => AbortSignal,
): void {
  router.add({
    name: 'login',
    description: 'Authenticate with MAL via OAuth PKCE S256',
    options: [
      // The positive side is implicit; users pass --no-open to skip the browser.
      { name: 'open', usage: '--no-open', description: 'Do not open browser', default: true },
    ],
    run: async ({ opts }) => {
      const dir = getDir()
      const logger = getLogger()
      const configStore = new JsonFileStore<Config>(dir, 'config.json', ConfigSchema)
      const tokenStore = new JsonFileStore<Token>(dir, 'mal_token.json', TokenSchema)
      const pkceStore = new JsonFileStore<PkceData>(dir, 'pkce.json', PkceSchema)

      const cfg = await configStore.load()
      if (cfg?.mal.clientId === undefined) {
        throw new ConfigError(
          'mal.clientId is required — run: ani2mal config set mal.clientId=YOUR_CLIENT_ID',
        )
      }

      let verifier: string
      let pkceData: PkceData | undefined
      try {
        pkceData = await pkceStore.load()
      } catch {
        logger.warn('PKCE state was corrupt; a new login URL has been generated')
      }
      if (pkceData && Date.now() - new Date(pkceData.createdAt).getTime() < 10 * 60 * 1000) {
        verifier = pkceData.verifier
      } else {
        if (pkceData) logger.warn('Previous login expired; here is a new URL')
        verifier = generateVerifier()
        await pkceStore.save({ verifier, createdAt: new Date().toISOString() })
      }

      const url = await buildAuthorizeUrl(cfg.mal.clientId, verifier)
      logger.info(`Open this URL to authorize:\n${url}`)

      if (opts.open !== false) {
        try {
          await openBrowser(url)
        } catch {
          logger.warn('Failed to open browser; please open the URL manually')
        }
      }

      let code: string | undefined
      if (isNonInteractive() || !process.stdin.isTTY) {
        code = process.env.ANI2MAL_AUTH_CODE
        if (code === undefined) {
          throw new ConfigError(
            'Non-interactive: set ANI2MAL_AUTH_CODE or run interactively and paste the code',
          )
        }
      } else {
        code = await askCode()
        if (!code) throw new AuthError('No code provided')
      }

      const exchangeParams: {
        grant_type: 'authorization_code'
        client_id: string
        code: string
        code_verifier: string
        client_secret?: string
      } = {
        grant_type: 'authorization_code',
        client_id: cfg.mal.clientId,
        code,
        code_verifier: verifier,
      }
      if (cfg.mal.clientSecret !== undefined) exchangeParams.client_secret = cfg.mal.clientSecret

      const token = await exchangeToken(exchangeParams, globalThis.fetch, getSignal())
      await tokenStore.save(token)
      await pkceStore.delete()
      logger.success('Logged in. Token expires in ~31d.')
    },
  })
}
