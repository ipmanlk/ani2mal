import type { Media } from '@/domain/media.ts'
import { ApiError, AuthError, NetworkError, NotFoundError, RateLimitError } from '@/lib/errors.ts'
import { abortableDelay, requestSignal, rethrowAbort } from '@/lib/signal.ts'
import type { MalPort } from '@/ports/mal.ts'
import type { TokenProvider } from '@/ports/token.ts'
import { type MalDatum, malUpdateBody, mapMalDatum } from './mapper.ts'
import { paginate } from './pagination.ts'

export class MalClient implements MalPort {
  #fetchImpl: typeof fetch
  #tokens: TokenProvider
  #timeoutMs: number
  constructor(
    fetchImpl: typeof fetch = globalThis.fetch,
    tokens: TokenProvider,
    timeoutMs = 15_000,
  ) {
    this.#fetchImpl = fetchImpl
    this.#tokens = tokens
    this.#timeoutMs = timeoutMs
  }

  async getLists(signal?: AbortSignal): Promise<{ anime: Media[]; manga: Media[] }> {
    const [anime, manga] = await Promise.all([
      this.#getOneList('anime', signal),
      this.#getOneList('manga', signal),
    ])
    return { anime, manga }
  }

  async #getOneList(type: 'anime' | 'manga', parent?: AbortSignal): Promise<Media[]> {
    const results: Media[] = []
    const makeUrl = (offset: number) =>
      `https://api.myanimelist.net/v2/users/@me/${type}list?fields=list_status&limit=1000&offset=${offset}&nsfw=true`

    const fetchPage = async (
      url: string,
      sig?: AbortSignal,
    ): Promise<{ data: MalDatum[]; paging?: { next?: string | null } }> => {
      const page = await this.#requestWithRetry(
        url,
        { method: 'GET' },
        parent,
        requestSignal(sig ?? parent, this.#timeoutMs),
      )
      const json = (await page.json()) as { data: MalDatum[]; paging?: { next?: string | null } }
      return json.paging !== undefined
        ? { data: json.data ?? [], paging: json.paging }
        : { data: json.data ?? [] }
    }

    for await (const chunk of paginate<MalDatum>(makeUrl, fetchPage, parent)) {
      for (const datum of chunk) {
        results.push(mapMalDatum(datum, type))
      }
    }
    return results
  }

  async updateOne(media: Media, parent?: AbortSignal): Promise<void> {
    const signal = requestSignal(parent, this.#timeoutMs)
    const body = malUpdateBody(media)
    await this.#send(
      `https://api.myanimelist.net/v2/${media.type}/${media.id}/my_list_status`,
      'PUT',
      body,
      signal,
      parent,
    )
  }

  async deleteOne(media: Media, parent?: AbortSignal): Promise<void> {
    const signal = requestSignal(parent, this.#timeoutMs)
    await this.#send(
      `https://api.myanimelist.net/v2/${media.type}/${media.id}/my_list_status`,
      'DELETE',
      undefined,
      signal,
      parent,
    )
  }

  async #send(
    url: string,
    method: string,
    body: string | undefined,
    signal: AbortSignal,
    parent?: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.#authHeader(signal)}`,
      'content-type': 'application/x-www-form-urlencoded',
    }
    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      headers['content-length'] = String(body.length)
      init.body = body
    }

    await this.#requestWithRetry(url, init, parent, signal)
  }

  async #authHeader(signal?: AbortSignal): Promise<string> {
    return `Bearer ${await this.#tokens.getAccessToken(signal)}`
  }

  async #requestWithRetry(
    url: string,
    init: RequestInit,
    parent: AbortSignal | undefined,
    signal: AbortSignal,
  ): Promise<Response> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.#execute(url, init, parent, signal)
      } catch (err: unknown) {
        lastError = err
        const retryAfterMs = err instanceof RateLimitError ? err.retryAfterMs : undefined
        const serverStatus = err instanceof NetworkError ? err.status : undefined
        const retryable = attempt < 2 &&
          (retryAfterMs !== undefined || (serverStatus !== undefined && serverStatus >= 500))
        if (!retryable) throw err
        const backoff = retryAfterMs ?? 1000 * 2 ** attempt + Math.random() * 200
        await abortableDelay(backoff, signal)
      }
    }
    throw lastError
  }

  async #execute(
    url: string,
    init: RequestInit,
    parent: AbortSignal | undefined,
    signal: AbortSignal,
  ): Promise<Response> {
    let res: Response
    try {
      res = await this.#fetchImpl(url, { ...init, signal })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      rethrowAbort(err, parent, signal, 'MAL')
      throw new NetworkError(`Network error: ${msg}`, undefined, err)
    }

    if (res.status === 401) {
      try {
        await this.#tokens.refresh(parent)
      } catch (err: unknown) {
        rethrowAbort(err, parent, signal, 'MAL')
        throw new AuthError('Refresh token expired. Run: ani2mal login')
      }
      const retryAuth = await this.#authHeader(parent)
      const retryInit: RequestInit = {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: retryAuth },
        signal,
      }
      try {
        res = await this.#fetchImpl(url, retryInit)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        rethrowAbort(err, parent, signal, 'MAL')
        throw new NetworkError(`Network error on retry: ${msg}`, undefined, err)
      }
      if (res.status === 401) throw new AuthError('Refresh token expired. Run: ani2mal login')
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const parsed = retryAfter === null ? Number.NaN : Number(retryAfter) * 1000
      const ms = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000 + Math.random() * 200
      throw new RateLimitError(ms)
    }

    if (res.status >= 500) {
      throw new NetworkError(`MAL server error ${res.status}`, res.status)
    }

    if (res.status === 404 || res.status === 400) {
      throw new NotFoundError(
        `${await malErrorMessage(
          res,
        )} — Run: ani2mal exclude add <id> if this entry no longer exists`,
      )
    }

    if (res.status === 403) {
      throw new AuthError('Token lacks permission; recreate client or re-login')
    }

    if (!res.ok) {
      throw new ApiError(await malErrorMessage(res), res.status)
    }

    return res
  }
}

async function malErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.message === 'string') return body.message
  if (typeof body.error === 'string') return body.error
  return `MAL request failed (${res.status})`
}
