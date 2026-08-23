// Coverage gate: fails when overall lines drop below 80%, or when
// src/domain drops below 95% lines / 90% branches. The CLI layer is left
// out of the numbers on purpose; the smoke tests cover its wiring.

const LCOV_PATH = 'coverage/lcov.info'
const OVERALL_LINES = 80
const DOMAIN_LINES = 95
const DOMAIN_BRANCHES = 90

interface Record {
  file: string
  linesHit: number
  linesFound: number
  branchesHit: number
  branchesFound: number
}

const raw = await Deno.readTextFile(LCOV_PATH)
const records: Record[] = []

let current: Partial<Record> | undefined
for (const line of raw.split('\n')) {
  if (line.startsWith('SF:')) {
    current = { file: line.slice(3), linesHit: 0, linesFound: 0, branchesHit: 0, branchesFound: 0 }
  } else if (!current) {
    continue
  } else if (line.startsWith('LF:')) {
    current.linesFound = Number(line.slice(3))
  } else if (line.startsWith('LH:')) {
    current.linesHit = Number(line.slice(3))
  } else if (line.startsWith('BRF:')) {
    current.branchesFound = Number(line.slice(4))
  } else if (line.startsWith('BRH:')) {
    current.branchesHit = Number(line.slice(4))
  } else if (line === 'end_of_record') {
    if (current.file !== undefined) records.push(current as Record)
    current = undefined
  }
}

if (records.length === 0) {
  console.error(`No coverage records found at ${LCOV_PATH}`)
  Deno.exit(1)
}

function pct(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100
}

function summarize(rows: Record[]) {
  const lh = rows.reduce((n, r) => n + r.linesHit, 0)
  const lf = rows.reduce((n, r) => n + r.linesFound, 0)
  const bh = rows.reduce((n, r) => n + r.branchesHit, 0)
  const bf = rows.reduce((n, r) => n + r.branchesFound, 0)
  return { lines: pct(lh, lf), branches: pct(bh, bf) }
}

const counted = records.filter((r) => !r.file.includes('/src/cli/'))
const domain = counted.filter((r) => r.file.includes('/src/domain/'))

const overall = summarize(counted)
const domainStats = summarize(domain)

console.log(
  `overall lines: ${overall.lines.toFixed(1)}% (gate ${OVERALL_LINES}%)`,
)
console.log(
  `domain lines: ${domainStats.lines.toFixed(1)}% (gate ${DOMAIN_LINES}%), branches: ${
    domainStats.branches.toFixed(1)
  }% (gate ${DOMAIN_BRANCHES}%)`,
)

const failures: string[] = []
if (overall.lines < OVERALL_LINES) failures.push(`overall lines ${overall.lines.toFixed(1)}%`)
if (domain.lines < DOMAIN_LINES) failures.push(`domain lines ${domain.lines.toFixed(1)}%`)
if (domain.branches < DOMAIN_BRANCHES) {
  failures.push(`domain branches ${domain.branches.toFixed(1)}%`)
}
if (failures.length > 0) {
  console.error(`✖ coverage gate failed: ${failures.join(', ')}`)
  Deno.exit(1)
}
console.log('✓ coverage gate ok')
