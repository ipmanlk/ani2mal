// A recording test double: counts calls and keeps the arguments so tests can
// assert on them.
export interface FakeFn {
  (...args: unknown[]): unknown
  readonly calls: unknown[][]
}

export function fakeFn(impl?: (args: unknown[]) => unknown): FakeFn {
  const calls: unknown[][] = []
  const fn = (...args: unknown[]): unknown => {
    calls.push(args)
    return impl?.(args)
  }
  return Object.assign(fn, { calls })
}

// Convenience wrapper for fakes that always resolve with the same value.
export function fakeResolved(value: unknown): FakeFn {
  return fakeFn(() => Promise.resolve(value))
}
