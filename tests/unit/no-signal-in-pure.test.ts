import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '../helpers/testkit.ts'

describe('pure modules have no AbortSignal param', () => {
  it('no exported function in domain or export/xml accepts AbortSignal', () => {
    const files = ['src/domain/media.ts', 'src/domain/diff.ts', 'src/export/xml.ts']
    for (const f of files) {
      const content = readFileSync(path.resolve(f), 'utf8')
      // regex overkill is fine here — a signal param in domain would be a design bug anyway
      const matches = content.match(/AbortSignal/g)
      expect(matches, `AbortSignal found in ${f}`).toBeNull()
    }
  })
})
