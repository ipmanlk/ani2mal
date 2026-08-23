import {
  MAL_TO_ANI,
  malId,
  type MalStatus,
  type Media,
  type MediaType,
  scoreOf,
  toMalStatus,
} from '@/domain/media.ts'

interface MalListStatus {
  status: MalStatus
  score: number
  num_episodes_watched?: number
  num_chapters_read?: number
  is_rewatching?: boolean
  is_rereading?: boolean
  num_times_rewatched?: number
  num_times_reread?: number
}

export interface MalDatum {
  node: { id: number; title: string; num_episodes?: number; num_chapters?: number }
  list_status: MalListStatus
}

export function mapMalDatum(datum: MalDatum, type: MediaType): Media {
  const ls = datum.list_status
  // MAL only ever returns the statuses in MAL_TO_ANI, but fail loudly if
  // that ever changes instead of writing undefined into a list entry.
  const status = MAL_TO_ANI[ls.status]
  if (status === undefined) {
    throw new Error(`unknown MAL list status "${ls.status}" for ${datum.node.id}`)
  }
  const score = scoreOf(ls.score ?? 0)
  const progress = type === 'anime' ? (ls.num_episodes_watched ?? 0) : (ls.num_chapters_read ?? 0)
  const repeat = ls.num_times_rewatched ?? ls.num_times_reread ?? 0
  const length = type === 'anime'
    ? (datum.node.num_episodes ?? null)
    : (datum.node.num_chapters ?? null)

  const base = {
    id: malId(datum.node.id),
    progress,
    score,
    status,
    repeat,
    length: length ?? null,
  }

  if (type === 'anime') return { ...base, type: 'anime' } as Media
  return { ...base, type: 'manga' } as Media
}

export function malUpdateBody(media: Media): string {
  const status = toMalStatus(media.status, media.type)
  const params: Record<string, string> = {
    status,
    score: String(media.score),
  }
  // MAL keeps its own rewatch flags; AniList has nothing to mirror them from.
  if (media.type === 'anime') {
    params.num_watched_episodes = String(media.progress)
  } else {
    params.num_chapters_read = String(media.progress)
  }
  return new URLSearchParams(params).toString()
}
