import type { FormattedLists, MalId, Media } from './media.ts'

export interface DiffResult {
  anime: { update: Media[]; delete: Media[] }
  manga: { update: Media[]; delete: Media[] }
}

export function diffLists(
  anilist: FormattedLists,
  mal: { anime: Media[]; manga: Media[] },
  opts: { excludes: ReadonlySet<MalId>; prune: boolean },
): DiffResult {
  const res: DiffResult = { anime: { update: [], delete: [] }, manga: { update: [], delete: [] } }
  for (const type of ['anime', 'manga'] as const) {
    const malById = new Map(mal[type].map((m) => [m.id, m] as const))
    for (const a of anilist[type].list) {
      if (opts.excludes.has(a.id)) continue
      const m = malById.get(a.id)
      if (m === undefined || !equalMedia(a, m)) res[type].update.push(a)
    }
    if (opts.prune) {
      const aniIds = new Set(anilist[type].list.map((a) => a.id))
      for (const m of mal[type]) {
        if (!aniIds.has(m.id) && !opts.excludes.has(m.id)) res[type].delete.push(m)
      }
    }
  }
  return res
}

export function equalMedia(a: Media, b: Media): boolean {
  return (
    a.status === b.status &&
    a.progress === b.progress &&
    a.score === b.score &&
    a.repeat === b.repeat
  )
}
