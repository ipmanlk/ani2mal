import type { Token } from '@/config/schema.ts'
import { TokenSchema } from '@/config/schema.ts'
import { AuthError, NetworkError } from '@/lib/errors.ts'
import { requestSignal, rethrowAbort } from '@/lib/signal.ts'
import * as v from 'valibot'

export interface ExchangeParams {
  grant_type: 'authorization_code' | 'refresh_token'
  client_id: string
  code?: string
  code_verifier?: string
  refresh_token?: string
}

export type ExchangeParamsWithSecret = ExchangeParams & { client_secret?: string }

export async function exchangeToken(
  params: ExchangeParamsWithSecret,
  fetchImpl: typeof fetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<Token> {
  const body = new URLSearchParams()
  body.set('grant_type', params.grant_type)
  body.set('client_id', params.client_id)
  if (params.client_secret !== undefined) body.set('client_secret', params.client_secret)
  if (params.code !== undefined) body.set('code', params.code)
  if (params.code_verifier !== undefined) body.set('code_verifier', params.code_verifier)
  if (params.refresh_token !== undefined) body.set('refresh_token', params.refresh_token)

  const reqSignal = requestSignal(signal, 15_000)
  let res: Response
  try {
    res = await fetchImpl('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: reqSignal,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    rethrowAbort(err, signal, reqSignal, 'MAL OAuth')
    throw new NetworkError(`Network error during token exchange: ${msg}`, undefined, err)
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>

  if (!res.ok) {
    const msg = typeof json.error === 'string'
      ? json.error
      : typeof json.message === 'string'
      ? json.message
      : `Token exchange failed (${res.status})`
    if (res.status === 400 || res.status === 401) {
      throw new AuthError(msg)
    }
    throw new NetworkError(msg)
  }

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 31 * 24 * 3600
  const tokenRaw = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: 'Bearer' as const,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }

  const parsed = v.safeParse(TokenSchema, tokenRaw)
  if (!parsed.success) {
    throw new AuthError(
      `MAL returned an invalid token response (${parsed.issues[0]?.message})`,
    )
  }
  return parsed.output
}
