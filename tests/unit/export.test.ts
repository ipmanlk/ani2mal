import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from '../helpers/testkit.ts'
import { writeExports } from '@/export/writer.ts'
import { buildAnimeXML, buildMangaXML } from '@/export/xml.ts'
import { fakeFormattedLists, makeMedia } from '../helpers/factories.ts'

describe('buildAnimeXML', () => {
  it('produces valid XML with header and myinfo', () => {
    const list = [
      makeMedia({
        type: 'anime',
        id: 1,
        status: 'current',
        progress: 5,
        score: 8,
        repeat: 0,
        length: 12,
      }),
    ]
    const fmt = fakeFormattedLists(list, [])
    const xml = buildAnimeXML(fmt.anime, 'Jimmy')
    expect(xml).toContain('<?xml')
    expect(xml).toContain('<myanimelist>')
    expect(xml).toContain('<user_name>Jimmy</user_name>')
    expect(xml).toContain('<user_id>0</user_id>')
    expect(xml).toContain('<series_animedb_id>1</series_animedb_id>')
    expect(xml).toContain('<my_status>Watching</my_status>')
    expect(xml).toContain('<update_on_import>1</update_on_import>')
    expect(xml).toContain('<series_episodes>12</series_episodes>')
  })
  it('omits series_episodes when length null', () => {
    const list = [
      makeMedia({
        type: 'anime',
        id: 1,
        status: 'current',
        progress: 0,
        score: 0,
        repeat: 0,
        length: null,
      }),
    ]
    const fmt = fakeFormattedLists(list, [])
    const xml = buildAnimeXML(fmt.anime, 'Jimmy')
    expect(xml).not.toContain('series_episodes')
  })
  it('status literals correct', () => {
    const cases: Array<[string, string]> = [
      ['planning', 'Plan to Watch'],
      ['current', 'Watching'],
      ['completed', 'Completed'],
      ['paused', 'On-Hold'],
      ['dropped', 'Dropped'],
    ]
    for (const [status, literal] of cases) {
      const m = makeMedia({
        type: 'anime',
        id: 1,
        status: status as never,
        progress: 0,
        score: 0,
        repeat: 0,
      })
      const fmt = fakeFormattedLists([m], [])
      const xml = buildAnimeXML(fmt.anime, 'U')
      expect(xml).toContain(`<my_status>${literal}</my_status>`)
    }
  })
  it('re-parse row count matches myinfo total', () => {
    const list = Array.from(
      { length: 5 },
      (_, i) =>
        makeMedia({
          type: 'anime',
          id: i + 1,
          status: 'current',
          progress: i,
          score: 7,
          repeat: 0,
        }),
    )
    const fmt = fakeFormattedLists(list, [])
    const xml = buildAnimeXML(fmt.anime, 'U')
    const parser = new XMLParser()
    const parsed = parser.parse(xml) as {
      myanimelist: { myinfo: { user_total_anime: number }; anime: unknown }
    }
    expect(Number(parsed.myanimelist.myinfo.user_total_anime)).toBe(5)
    const animeEntries = Array.isArray(parsed.myanimelist.anime)
      ? parsed.myanimelist.anime
      : [parsed.myanimelist.anime]
    expect(animeEntries.length).toBe(5)
  })
  it('my_score integer 0-10', () => {
    const m = makeMedia({
      type: 'anime',
      id: 1,
      status: 'completed',
      progress: 12,
      score: 9,
      repeat: 1,
    })
    const fmt = fakeFormattedLists([m], [])
    const xml = buildAnimeXML(fmt.anime, 'U')
    expect(xml).toContain('<my_score>9</my_score>')
    expect(xml).toContain('<my_times_watched>1</my_times_watched>')
  })
})

describe('buildMangaXML', () => {
  it('produces manga literals', () => {
    const m = makeMedia({
      type: 'manga',
      id: 101,
      status: 'planning',
      progress: 0,
      score: 0,
      repeat: 0,
      length: 50,
    })
    const fmt = fakeFormattedLists([], [m])
    const xml = buildMangaXML(fmt.manga, 'U')
    expect(xml).toContain('<series_mangadb_id>101</series_mangadb_id>')
    expect(xml).toContain('<my_status>Plan to Read</my_status>')
    expect(xml).toContain('<series_chapters>50</series_chapters>')
  })
})

describe('writeExports', () => {
  it('writes both files by default', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-test-'))
    try {
      const fmta = fakeFormattedLists([makeMedia({ type: 'anime', id: 1 })], [])
      const fmtm = fakeFormattedLists([], [makeMedia({ type: 'manga', id: 101 })])
      const a = buildAnimeXML(fmta.anime, 'U')
      const m = buildMangaXML(fmtm.manga, 'U')
      const files = await writeExports(dir, a, m, { force: false, type: 'both' })
      expect(files).toHaveLength(2)
      expect(files[0]).toContain('anime.xml')
      expect(files[1]).toContain('manga.xml')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('refuses overwrite without --force', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-test-'))
    try {
      const fmta = fakeFormattedLists([makeMedia({ type: 'anime', id: 1 })], [])
      const fmtm = fakeFormattedLists([], [])
      const a = buildAnimeXML(fmta.anime, 'U')
      const m = buildMangaXML(fmtm.manga, 'U')
      await writeExports(dir, a, m, { force: false, type: 'anime' })
      await expect(writeExports(dir, a, m, { force: false, type: 'anime' })).rejects.toThrow(
        /exists.*--force/,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('overwrites with --force', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-test-'))
    try {
      const fmta = fakeFormattedLists([makeMedia({ type: 'anime', id: 1 })], [])
      const m = ''
      const a = buildAnimeXML(fmta.anime, 'U')
      await writeExports(dir, a, m, { force: false, type: 'anime' })
      const fmta2 = fakeFormattedLists([makeMedia({ type: 'anime', id: 2 })], [])
      const a2 = buildAnimeXML(fmta2.anime, 'U')
      const files = await writeExports(dir, a2, m, { force: true, type: 'anime' })
      expect(files).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('type filter', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ani-test-'))
    try {
      const fmta = fakeFormattedLists([makeMedia({ type: 'anime', id: 1 })], [])
      const fmtm = fakeFormattedLists([], [makeMedia({ type: 'manga', id: 101 })])
      const a = buildAnimeXML(fmta.anime, 'U')
      const m = buildMangaXML(fmtm.manga, 'U')
      const animeOnly = await writeExports(dir, a, m, { force: true, type: 'anime' })
      expect(animeOnly).toHaveLength(1)
      expect(animeOnly[0]).toContain('anime.xml')
      await rm(dir, { recursive: true, force: true })
      const { mkdir } = await import('node:fs/promises')
      await mkdir(dir, { recursive: true })
      const mangaOnly = await writeExports(dir, a, m, { force: false, type: 'manga' })
      expect(mangaOnly).toHaveLength(1)
      expect(mangaOnly[0]).toContain('manga.xml')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
