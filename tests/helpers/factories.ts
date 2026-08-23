import { type AniStatus, malId, type Media, type MediaType, scoreOf } from '@/domain/media.ts'

// Builds Media values from plain primitives. The domain type brands id and
// score, but tests think in raw numbers, so this helper does the branding.
export function makeMedia(over: {
  type: MediaType
  id: number
  progress?: number
  score?: number
  status?: AniStatus
  repeat?: number
  length?: number | null
}): Media {
  return {
    type: over.type,
    id: malId(over.id),
    progress: over.progress ?? 0,
    score: scoreOf(over.score ?? 0),
    status: over.status ?? 'current',
    repeat: over.repeat ?? 0,
    length: over.length ?? null,
  }
}

export function fakeFormattedLists(anime: Media[] = [], manga: Media[] = []) {
  const mk = (list: Media[]) => ({
    list,
    stats: {
      total: list.length,
      planning: 0,
      current: list.length,
      completed: 0,
      paused: 0,
      dropped: 0,
    },
    skippedNoMalId: 0,
    skippedUnknownStatus: 0,
  })
  return { anime: mk(anime), manga: mk(manga) }
}
