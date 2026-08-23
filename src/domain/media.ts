export type MediaType = 'anime' | 'manga'
export type AniStatus = 'planning' | 'current' | 'completed' | 'paused' | 'dropped'

export type MalId = number & { readonly __brand: 'MalId' }
export type Score = number & { readonly __brand: 'Score' }

export function malId(n: number): MalId {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`malId(${n}): MAL ids are positive integers`)
  }
  return n as MalId
}

export function scoreOf(n: number): Score {
  const r = Math.round(n)
  if (!Number.isFinite(r) || r < 0 || r > 10) {
    throw new RangeError(`scoreOf(${n}): scores round into 0..10`)
  }
  return r as Score
}

export interface AnimeMedia {
  readonly type: 'anime'
  readonly id: MalId
  readonly progress: number
  readonly score: Score
  readonly status: AniStatus
  readonly repeat: number
  readonly length: number | null
}

export interface MangaMedia {
  readonly type: 'manga'
  readonly id: MalId
  readonly progress: number
  readonly score: Score
  readonly status: AniStatus
  readonly repeat: number
  readonly length: number | null
}

export type Media = AnimeMedia | MangaMedia

export type MalAnimeStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch'
export type MalMangaStatus = 'reading' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_read'
export type MalStatus = MalAnimeStatus | MalMangaStatus

const ANI_TO_MAL_ANIME = {
  planning: 'plan_to_watch',
  current: 'watching',
  completed: 'completed',
  paused: 'on_hold',
  dropped: 'dropped',
} as const satisfies Record<AniStatus, MalAnimeStatus>

const ANI_TO_MAL_MANGA = {
  planning: 'plan_to_read',
  current: 'reading',
  completed: 'completed',
  paused: 'on_hold',
  dropped: 'dropped',
} as const satisfies Record<AniStatus, MalMangaStatus>

export const ANI_TO_MAL = { anime: ANI_TO_MAL_ANIME, manga: ANI_TO_MAL_MANGA } as const

export const MAL_TO_ANI: Record<MalStatus, AniStatus> = {
  plan_to_watch: 'planning',
  plan_to_read: 'planning',
  watching: 'current',
  reading: 'current',
  completed: 'completed',
  on_hold: 'paused',
  dropped: 'dropped',
}

export function toMalStatus(status: AniStatus, type: MediaType): MalStatus {
  return ANI_TO_MAL[type][status]
}

export interface FormattedMediaList {
  stats: Stats
  list: Media[]
  skippedNoMalId: number
  skippedUnknownStatus: number
}

export interface FormattedLists {
  anime: FormattedMediaList
  manga: FormattedMediaList
}

export interface Stats {
  total: number
  planning: number
  current: number
  completed: number
  paused: number
  dropped: number
}

export function computeStats(list: readonly Media[]): Stats {
  return list.reduce(
    (s, m) => {
      s.total++
      s[m.status]++
      return s
    },
    { total: 0, planning: 0, current: 0, completed: 0, paused: 0, dropped: 0 } as Stats,
  )
}
