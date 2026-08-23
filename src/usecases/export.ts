import { writeExports } from '@/export/writer.ts'
import { buildAnimeXML, buildMangaXML } from '@/export/xml.ts'
import type { AnilistPort } from '@/ports/anilist.ts'

export interface ExportOptions {
  username: string
  type: 'anime' | 'manga' | 'both'
  outDir: string
  force: boolean
  malUsername?: string
}

export async function exportLists(
  anilist: AnilistPort,
  opts: ExportOptions,
  signal?: AbortSignal,
): Promise<{ files: string[]; skippedNoMalId: number; skippedUnknownStatus: number }> {
  const lists = await anilist.getLists(opts.username, signal)
  const userName = opts.malUsername ?? opts.username
  const animeXml = buildAnimeXML(lists.anime, userName)
  const mangaXml = buildMangaXML(lists.manga, userName)
  const files = await writeExports(opts.outDir, animeXml, mangaXml, {
    force: opts.force,
    type: opts.type,
  })
  const skipped = lists.anime.skippedNoMalId + lists.manga.skippedNoMalId
  const unknownStatus = lists.anime.skippedUnknownStatus + lists.manga.skippedUnknownStatus
  return { files, skippedNoMalId: skipped, skippedUnknownStatus: unknownStatus }
}
