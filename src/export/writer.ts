import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CliError } from '@/lib/errors.ts'

async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.tmp.${process.pid}`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, file)
}

export async function writeExports(
  outDir: string,
  anime: string,
  manga: string,
  opts: { force: boolean; type: 'anime' | 'manga' | 'both' },
): Promise<string[]> {
  await mkdir(outDir, { recursive: true })
  const targets = [
    ...(opts.type !== 'manga' ? [{ name: 'anime.xml', content: anime }] : []),
    ...(opts.type !== 'anime' ? [{ name: 'manga.xml', content: manga }] : []),
  ]
  if (!opts.force) {
    for (const t of targets) {
      try {
        await access(path.join(outDir, t.name))
        throw new CliError(`${t.name} exists — pass --force to overwrite`)
      } catch (e) {
        if (e instanceof CliError) throw e
      }
    }
  }
  await Promise.all(targets.map((t) => atomicWrite(path.join(outDir, t.name), t.content)))
  return targets.map((t) => path.join(outDir, t.name))
}
