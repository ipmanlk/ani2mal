import {
  type AniStatus,
  computeStats,
  type FormattedMediaList,
  malId,
  type Media,
  type MediaType,
  scoreOf,
} from '@/domain/media.ts'

interface RawEntry {
  status: string | null
  score: number | null
  progress: number | null
  repeat: number | null
  media: {
    idMal: number | null
    episodes: number | null
    chapters: number | null
    title: unknown
  } | null
}

interface RawList {
  name: string
  status: string | null
  isCustomList: boolean
  isSplitCompletedList: boolean
  entries: RawEntry[]
}

export interface RawCollection {
  lists: RawList[]
}

const NAME_TO_STATUS: Record<string, AniStatus> = {
  Planning: 'planning',
  Current: 'current',
  Completed: 'completed',
  Paused: 'paused',
  Dropped: 'dropped',
  Repeating: 'current',
}

function anilistNameToStatus(name: string): AniStatus | undefined {
  return NAME_TO_STATUS[name]
}

function toAniStatus(raw: string, nameFallback: string): AniStatus | undefined {
  const lower = raw.toLowerCase()
  if (lower === 'completed') return 'completed'
  if (lower === 'current') return 'current'
  if (lower === 'planning') return 'planning'
  if (lower === 'dropped') return 'dropped'
  if (lower === 'paused') return 'paused'
  if (lower === 'repeating') return 'current'
  return anilistNameToStatus(nameFallback)
}

export function mapAnilist(raw: RawCollection, type: MediaType): FormattedMediaList {
  const entries: Media[] = []
  let skippedNoMalId = 0
  let skippedUnknownStatus = 0
  for (const list of raw.lists) {
    // Custom and split-completed lists are extra views over entries that
    // already sit on their real status list; counting them too would
    // duplicate items in exports and diffs.
    if (list.isCustomList || list.isSplitCompletedList) continue
    const bucket = list.status
      ? (toAniStatus(list.status, list.name) ?? anilistNameToStatus(list.name))
      : anilistNameToStatus(list.name)
    for (const entry of list.entries) {
      const id = entry.media?.idMal
      if (id == null) {
        skippedNoMalId++
        continue
      }
      const status = entry.status ? toAniStatus(entry.status, list.name) : bucket
      if (!status) {
        skippedUnknownStatus++
        continue
      }
      const length = type === 'anime'
        ? (entry.media?.episodes ?? null)
        : (entry.media?.chapters ?? null)
      entries.push({
        type,
        id: malId(id),
        progress: entry.progress ?? 0,
        score: scoreOf(entry.score ?? 0),
        status,
        repeat: entry.repeat ?? 0,
        length: length ?? null,
      } as Media)
    }
  }
  return { stats: computeStats(entries), list: entries, skippedNoMalId, skippedUnknownStatus }
}
