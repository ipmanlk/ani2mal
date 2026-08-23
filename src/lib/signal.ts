import { TimeoutReachedError } from './errors.ts'

export function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (parent) return AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)])
  return AbortSignal.timeout(timeoutMs)
}

export function rethrowAbort(
  err: unknown,
  parent: AbortSignal | undefined,
  signal: AbortSignal | undefined,
  what: string,
): never {
  if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
  if (parent?.aborted) throw parent.reason
  const reason = signal?.reason
  if (reason instanceof DOMException && reason.name === 'TimeoutError') {
    throw new TimeoutReachedError(`${what} timed out`)
  }
  throw new TimeoutReachedError(`${what} timed out`)
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const t = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          resolve()
        },
        { once: true },
      )
    }
  })
}
