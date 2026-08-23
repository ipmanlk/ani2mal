// Download + verify logic shared by the postinstall hook and the bin shim:
// whichever runs first leaves a verified platform binary in bin/.
// Script-blocking package managers are common, so a missing binary means
// "download now" rather than an error.

'use strict'

const https = require('https')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const REPO = 'ipmanlk/ani2mal'

const TARGETS = {
  'linux-x64': 'ani2mal-linux-x64',
  'linux-arm64': 'ani2mal-linux-arm64',
  'darwin-x64': 'ani2mal-macos-x64',
  'darwin-arm64': 'ani2mal-macos-arm64',
  'win32-x64': 'ani2mal-windows-x64.exe',
}

function targetFor(platform, arch) {
  const archName = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : undefined
  if (!archName) return undefined
  return TARGETS[`${platform}-${archName}`]
}

function fetchBuffer(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('too many redirects'))
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          resolve(fetchBuffer(new URL(res.headers.location, url).href, redirects + 1))
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

function binDir() {
  return path.join(__dirname, '..', 'bin')
}

function binaryPath(asset) {
  return path.join(binDir(), asset)
}

function versionStampPath() {
  return path.join(binDir(), 'VERSION')
}

function installedVersion() {
  try {
    return fs.readFileSync(versionStampPath(), 'utf8').trim()
  } catch {
    return undefined
  }
}

// Returns the absolute path to a ready-to-run binary, downloading it when the
// file is absent or belongs to a different package version.
async function ensureBinary({ log = () => {} } = {}) {
  if (process.env.ANI2MAL_SKIP_DOWNLOAD === '1') {
    throw new Error('ANI2MAL_SKIP_DOWNLOAD=1 set, refusing to download')
  }

  const { version } = require(path.join(__dirname, '..', 'package.json'))
  const asset = targetFor(process.platform, process.arch)
  if (!asset) {
    throw new Error(`no prebuilt ani2mal binary exists for ${process.platform}-${process.arch}`)
  }

  const dest = binaryPath(asset)
  const upToDate = fs.existsSync(dest) && installedVersion() === version
  if (upToDate && !process.env.ANI2MAL_FORCE_DOWNLOAD) return dest

  const base = `https://github.com/${REPO}/releases/download/v${version}/${asset}`
  log(`downloading ${base}`)

  let binary
  let checksumLine
  try {
    ;[binary, checksumLine] = await Promise.all([
      fetchBuffer(base),
      fetchBuffer(`${base}.sha256`).then((b) => b.toString('utf8').trim().split(/\s+/)[0]),
    ])
  } catch (err) {
    throw new Error(
      `download failed: ${err.message}\n` +
        `you can grab the binary manually from https://github.com/${REPO}/releases\n` +
        `and point ANI2MAL_BINARY at it`,
    )
  }

  const actual = crypto.createHash('sha256').update(binary).digest('hex')
  if (actual !== checksumLine) {
    throw new Error(`checksum mismatch: expected ${checksumLine}, got ${actual}`)
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  // Temp file plus rename, so a partially written binary never looks valid.
  const tmp = `${dest}.download-${process.pid}`
  fs.writeFileSync(tmp, binary, { mode: 0o755 })
  fs.renameSync(tmp, dest)
  fs.chmodSync(dest, 0o755)
  fs.writeFileSync(versionStampPath(), `${version}\n`)
  log(`installed ${asset} (sha256 ok)`)
  return dest
}

module.exports = { ensureBinary, binaryPath, targetFor }
