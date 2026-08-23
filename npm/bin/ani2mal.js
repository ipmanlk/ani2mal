#!/usr/bin/env node
// Launcher for ani2mal. Resolution order:
//   1. ANI2MAL_BINARY env var (distro packagers, manual installs)
//   2. the binary postinstall downloaded, or a fresh download on first run
// Script-blocking package managers never run our postinstall, so the first
// invocation simply fetches the binary here and then carries on.

'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const { ensureBinary } = require('../scripts/download')

function resolveExisting() {
  const override = process.env.ANI2MAL_BINARY
  if (override && fs.existsSync(override)) return override
  if (override) {
    process.stderr.write(`warning: ANI2MAL_BINARY=${override} does not exist; ignoring\n`)
  }
  return undefined
}

async function main() {
  let bin = resolveExisting()

  if (!bin) {
    try {
      bin = await ensureBinary({ log: (m) => process.stderr.write(`${m}\n`) })
    } catch (err) {
      process.stderr.write(
        `ani2mal binary is not available (${process.platform}-${process.arch}).\n` +
          `${err.message}\n` +
          `Alternatively install with scripts allowed: npm install -g ani2mal --foreground-scripts\n` +
          `or point ANI2MAL_BINARY at a downloaded ani2mal binary.\n`,
      )
      process.exit(1)
    }
  }

  const result = spawnSync(bin, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: true,
  })

  if (result.error) {
    process.stderr.write(`failed to launch ani2mal: ${result.error.message}\n`)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

main()
