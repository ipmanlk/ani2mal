import type { AnimeMedia, AniStatus, FormattedMediaList, MangaMedia } from '@/domain/media.ts'
import { computeStats } from '@/domain/media.ts'

const EXPORT_STATUS_ANIME: Record<AniStatus, string> = {
  planning: 'Plan to Watch',
  current: 'Watching',
  completed: 'Completed',
  paused: 'On-Hold',
  dropped: 'Dropped',
}

const EXPORT_STATUS_MANGA: Record<AniStatus, string> = {
  planning: 'Plan to Read',
  current: 'Reading',
  completed: 'Completed',
  paused: 'On-Hold',
  dropped: 'Dropped',
}

// Usernames are the only free-form text here; escape the five XML specials.
function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function el(name: string, value: string | number): string {
  return `    <${name}>${esc(String(value))}</${name}>`
}

function myinfo(kind: 'anime' | 'manga', userName: string, list: FormattedMediaList): string[] {
  const stats = computeStats(list.list)
  const counters: Array<[string, number]> = kind === 'anime'
    ? [
      ['user_total_anime', stats.total],
      ['user_total_watching', stats.current],
      ['user_total_completed', stats.completed],
      ['user_total_onhold', stats.paused],
      ['user_total_dropped', stats.dropped],
      ['user_total_plantowatch', stats.planning],
    ]
    : [
      ['user_total_manga', stats.total],
      ['user_total_reading', stats.current],
      ['user_total_completed', stats.completed],
      ['user_total_onhold', stats.paused],
      ['user_total_dropped', stats.dropped],
      ['user_total_plantoread', stats.planning],
    ]
  return [
    '  <myinfo>',
    el('user_id', 0),
    el('user_name', userName),
    el('user_export_type', kind === 'anime' ? 1 : 2),
    ...counters.map(([name, value]) => el(name, value)),
    '  </myinfo>',
  ]
}

function animeRows(list: readonly AnimeMedia[]): string[] {
  const rows: string[] = []
  for (const m of list) {
    rows.push('  <anime>', el('series_animedb_id', m.id))
    if (m.length !== null) rows.push(el('series_episodes', m.length))
    rows.push(
      el('my_watched_episodes', m.progress),
      el('my_score', m.score),
      el('my_status', EXPORT_STATUS_ANIME[m.status]),
      el('my_times_watched', m.repeat),
      el('update_on_import', 1),
      '  </anime>',
    )
  }
  return rows
}

function mangaRows(list: readonly MangaMedia[]): string[] {
  const rows: string[] = []
  for (const m of list) {
    rows.push('  <manga>', el('series_mangadb_id', m.id))
    if (m.length !== null) rows.push(el('series_chapters', m.length))
    rows.push(
      el('my_read_chapters', m.progress),
      el('my_score', m.score),
      el('my_status', EXPORT_STATUS_MANGA[m.status]),
      el('my_times_read', m.repeat),
      el('update_on_import', 1),
      '  </manga>',
    )
  }
  return rows
}

function render(header: string[], body: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<myanimelist>',
    ...header,
    ...body,
    '</myanimelist>',
  ].join('\n')
}

export function buildAnimeXML(list: FormattedMediaList, userName: string): string {
  return render(
    myinfo('anime', userName, list),
    animeRows(list.list.filter((m) => m.type === 'anime')),
  )
}

export function buildMangaXML(list: FormattedMediaList, userName: string): string {
  return render(
    myinfo('manga', userName, list),
    mangaRows(list.list.filter((m) => m.type === 'manga')),
  )
}
