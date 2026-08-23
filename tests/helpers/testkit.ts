// describe/it glue over Deno.test; expect comes from @std/expect.
// Nested describe blocks are not supported because nothing needed them.
import { expect } from '@std/expect'

export { expect }

type TestFn = () => void | Promise<void>

interface Case {
  name: string
  fn: TestFn
}

let collecting: Case[] | null = null

export function describe(name: string, body: () => void): void {
  if (collecting !== null) {
    throw new Error('nested describe blocks are not supported')
  }
  const cases: Case[] = []
  collecting = cases
  try {
    body()
  } finally {
    collecting = null
  }
  for (const c of cases) {
    Deno.test(`${name} - ${c.name}`, c.fn)
  }
}

export function it(name: string, fn: TestFn): void {
  if (collecting === null) {
    throw new Error(`it("${name}") must sit inside a describe block`)
  }
  collecting.push({ name, fn })
}
