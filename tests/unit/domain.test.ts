import { describe, expect, it } from '../helpers/testkit.ts'
import { diffLists, equalMedia } from '@/domain/diff.ts'
import {
  ANI_TO_MAL,
  computeStats,
  MAL_TO_ANI,
  malId,
  scoreOf,
  toMalStatus,
} from '@/domain/media.ts'
import { fakeFormattedLists, makeMedia } from '../helpers/factories.ts'

describe('malId', () => {
  it('accepts positive ints', () => {
    expect(malId(1)).toBe(1)
    expect(malId(999999)).toBe(999999)
  })
  it('rejects 0, negatives, non-ints', () => {
    expect(() => malId(0)).toThrow()
    expect(() => malId(-1)).toThrow()
    expect(() => malId(1.5)).toThrow()
    expect(() => malId(NaN)).toThrow()
  })
})

describe('scoreOf', () => {
  it('boundary table', () => {
    expect(scoreOf(0)).toBe(0)
    expect(scoreOf(0.4)).toBe(0)
    expect(scoreOf(0.5)).toBe(1)
    expect(scoreOf(9.5)).toBe(10)
    expect(scoreOf(10)).toBe(10)
  })
  it('throws out of range', () => {
    expect(() => scoreOf(10.6)).toThrow()
    expect(() => scoreOf(-1)).toThrow()
    expect(() => scoreOf(NaN)).toThrow()
    expect(() => scoreOf(Infinity)).toThrow()
  })
})

describe('computeStats', () => {
  it('totals equal sum of buckets', () => {
    const list = [
      makeMedia({ type: 'anime', id: 1, status: 'planning' }),
      makeMedia({ type: 'anime', id: 2, status: 'current' }),
      makeMedia({ type: 'anime', id: 3, status: 'completed' }),
    ]
    const s = computeStats(list)
    expect(s.total).toBe(3)
    expect(s.planning + s.current + s.completed + s.paused + s.dropped).toBe(s.total)
  })
})

describe('status maps', () => {
  it('round-trip MAL_TO_ANI[toMalStatus(s,t)] === s', () => {
    const statuses = ['planning', 'current', 'completed', 'paused', 'dropped'] as const
    const types = ['anime', 'manga'] as const
    for (const s of statuses) {
      for (const t of types) {
        const mal = toMalStatus(s, t)
        expect(MAL_TO_ANI[mal]).toBe(s)
      }
    }
  })
  it('ANI_TO_MAL has both anime and manga keys', () => {
    expect(ANI_TO_MAL.anime.planning).toBe('plan_to_watch')
    expect(ANI_TO_MAL.manga.planning).toBe('plan_to_read')
  })
})

describe('equalMedia', () => {
  it('equal when all fields same', () => {
    const a = makeMedia({
      type: 'anime',
      id: 1,
      status: 'current',
      progress: 5,
      score: 8,
      repeat: 0,
    })
    const b = makeMedia({
      type: 'anime',
      id: 1,
      status: 'current',
      progress: 5,
      score: 8,
      repeat: 0,
    })
    expect(equalMedia(a, b)).toBe(true)
  })
  it('table-driven mismatches', () => {
    const base = makeMedia({
      type: 'anime',
      id: 1,
      status: 'current',
      progress: 5,
      score: 8,
      repeat: 0,
    })
    expect(
      equalMedia(
        base,
        makeMedia({ type: 'anime', id: 1, status: 'completed', progress: 5, score: 8, repeat: 0 }),
      ),
    ).toBe(false)
    expect(
      equalMedia(
        base,
        makeMedia({ type: 'anime', id: 1, status: 'current', progress: 6, score: 8, repeat: 0 }),
      ),
    ).toBe(false)
    expect(
      equalMedia(
        base,
        makeMedia({ type: 'anime', id: 1, status: 'current', progress: 5, score: 7, repeat: 0 }),
      ),
    ).toBe(false)
    expect(
      equalMedia(
        base,
        makeMedia({ type: 'anime', id: 1, status: 'current', progress: 5, score: 8, repeat: 1 }),
      ),
    ).toBe(false)
  })
})

describe('diffLists', () => {
  it('property: diff(x, mirror) update == []', () => {
    const anime = [makeMedia({ type: 'anime', id: 1 }), makeMedia({ type: 'anime', id: 2 })]
    const manga = [makeMedia({ type: 'manga', id: 101 })]
    const formatted = fakeFormattedLists(anime, manga)
    const mal = { anime, manga }
    const res = diffLists(formatted, mal, { excludes: new Set(), prune: false })
    expect(res.anime.update).toHaveLength(0)
    expect(res.manga.update).toHaveLength(0)
  })
  it('produces update when field differs', () => {
    const ani = [makeMedia({ type: 'anime', id: 1, progress: 5 })]
    const mal = [makeMedia({ type: 'anime', id: 1, progress: 3 })]
    const fmt = fakeFormattedLists(ani, [])
    const res = diffLists(fmt, { anime: mal, manga: [] }, { excludes: new Set(), prune: false })
    expect(res.anime.update).toHaveLength(1)
  })
  it('creates delete only with prune', () => {
    const fmt = fakeFormattedLists([], [])
    const mal = { anime: [makeMedia({ type: 'anime', id: 99 })], manga: [] }
    expect(diffLists(fmt, mal, { excludes: new Set(), prune: false }).anime.delete).toHaveLength(0)
    expect(diffLists(fmt, mal, { excludes: new Set(), prune: true }).anime.delete).toHaveLength(1)
  })
  it('excludes skip both update and delete', () => {
    const a = makeMedia({ type: 'anime', id: 1, progress: 5 })
    const mal = [
      makeMedia({ type: 'anime', id: 1, progress: 3 }),
      makeMedia({ type: 'anime', id: 2 }),
    ]
    const fmt = fakeFormattedLists([a], [])
    const first = mal[0]
    const second = mal[1]
    if (!first || !second) throw new Error('fixture arrays must not be empty')
    const excludes = new Set([first.id, second.id])
    const res1 = diffLists(fmt, { anime: mal, manga: [] }, { excludes, prune: false })
    expect(res1.anime.update).toHaveLength(0)
    const res2 = diffLists(fmt, { anime: mal, manga: [] }, { excludes, prune: true })
    expect(res2.anime.delete).toHaveLength(0)
  })
  it('creates update for missing MAL entry (PUT creates)', () => {
    const ani = [makeMedia({ type: 'anime', id: 1 })]
    const fmt = fakeFormattedLists(ani, [])
    const res = diffLists(fmt, { anime: [], manga: [] }, { excludes: new Set(), prune: false })
    expect(res.anime.update).toHaveLength(1)
  })
  it('prune respects excludes for deletes', () => {
    const fmt = fakeFormattedLists([], [])
    const mal = {
      anime: [makeMedia({ type: 'anime', id: 10 }), makeMedia({ type: 'anime', id: 11 })],
      manga: [],
    }
    const first = mal.anime[0]
    const second = mal.anime[1]
    if (!first || !second) throw new Error('fixture arrays must not be empty')
    const excludes = new Set([first.id])
    const res = diffLists(fmt, mal, { excludes, prune: true })
    expect(res.anime.delete).toHaveLength(1)
    const deleted = res.anime.delete[0]
    if (!deleted) throw new Error('expected one delete')
    expect(deleted.id).toBe(second.id)
  })
})
