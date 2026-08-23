import type { FormattedLists } from '@/domain/media.ts'
import { ApiError, NetworkError, NotFoundError } from '@/lib/errors.ts'
import { requestSignal, rethrowAbort } from '@/lib/signal.ts'
import type { AnilistPort } from '@/ports/anilist.ts'
import { mapAnilist } from './mapper.ts'
import { MEDIA_LIST_COLLECTION } from './queries.ts'

export class AnilistClient implements AnilistPort {
  #fetchImpl: typeof fetch
  #timeoutMs: number
  constructor(fetchImpl: typeof fetch = globalThis.fetch, timeoutMs = 15_000) {
    this.#fetchImpl = fetchImpl
    this.#timeoutMs = timeoutMs
  }

  async getLists(username: string, parent?: AbortSignal): Promise<FormattedLists> {
    const signal = requestSignal(parent, this.#timeoutMs)
    const [anime, manga] = await Promise.all([
      this.#fetchOne('ANIME', username, signal, parent),
      this.#fetchOne('MANGA', username, signal, parent),
    ])
    return { anime: mapAnilist(anime, 'anime'), manga: mapAnilist(manga, 'manga') }
  }

  async #fetchOne(
    type: string,
    userName: string,
    signal: AbortSignal,
    parent: AbortSignal | undefined,
  ) {
    let res: Response
    try {
      res = await this.#fetchImpl('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query: MEDIA_LIST_COLLECTION, variables: { userName, type } }),
        signal,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      rethrowAbort(err, parent, signal, 'AniList')
      throw new NetworkError(`Network error fetching AniList ${type}: ${msg}`, undefined, err)
    }
    if (!res.ok) {
      throw new ApiError(`AniList request failed (${res.status}) for ${type}`)
    }
    const json = (await res.json()) as {
      data?: { MediaListCollection?: unknown }
      errors?: Array<{ message: string }>
    }
    if (json.errors?.length) {
      throw new ApiError(`AniList error: ${json.errors[0]?.message ?? 'unknown'}`)
    }
    if (!json.data?.MediaListCollection) {
      throw new NotFoundError(`No list for ${userName} (${type}); private or unknown user`)
    }
    return json.data.MediaListCollection as import('./mapper.ts').RawCollection
  }
}
