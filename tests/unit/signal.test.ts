import { describe, expect, it } from '../helpers/testkit.ts'
import { CancelledError, TimeoutReachedError } from '@/lib/errors.ts'
import { abortableDelay, requestSignal, rethrowAbort } from '@/lib/signal.ts'

describe('requestSignal', () => {
  it('pre-aborted parent => composite pre-aborted', () => {
    const p = new AbortController()
    p.abort(new CancelledError('cancelled'))
    const s = requestSignal(p.signal, 15_000)
    expect(s.aborted).toBe(true)
    expect(() => s.throwIfAborted()).toThrow(CancelledError)
  })
  it('no parent => timeout signal', async () => {
    const s = requestSignal(undefined, 10)
    expect(s.aborted).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(s.aborted).toBe(true)
  })
})

describe('rethrowAbort', () => {
  it('rethrows parent.reason when parent aborted', () => {
    const p = new AbortController()
    const err = new CancelledError('interrupted')
    p.abort(err)
    const s = requestSignal(p.signal, 15_000)
    const dom = new DOMException('aborted', 'AbortError')
    expect(() => rethrowAbort(dom, p.signal, s, 'test')).toThrow(err)
    try {
      rethrowAbort(dom, p.signal, s, 'test')
    } catch (e) {
      expect(e).toBe(err)
    }
  })
  it('throws TimeoutReachedError when deadline fired', () => {
    const s = AbortSignal.timeout(1)
    // wait for timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const dom = new DOMException('timeout', 'AbortError')
        expect(() => rethrowAbort(dom, undefined, s, 'MAL')).toThrow(TimeoutReachedError)
        resolve()
      }, 10)
    })
  })
  it('passes through non-abort errors', () => {
    const s = requestSignal(undefined, 15_000)
    const err = new Error('other')
    expect(() => rethrowAbort(err, undefined, s, 'x')).toThrow(err)
  })
})

describe('abortableDelay', () => {
  it('resolves immediately if already aborted', async () => {
    const c = new AbortController()
    c.abort()
    await abortableDelay(1000, c.signal)
  })
  it('resolves on abort during delay', async () => {
    const c = new AbortController()
    const p = abortableDelay(5000, c.signal)
    setTimeout(() => c.abort(), 10)
    await p
  })
})
