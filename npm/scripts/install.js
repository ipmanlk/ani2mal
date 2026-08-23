#!/usr/bin/env node
// postinstall hook. Package managers that allow scripts get the binary ready
// at install time; ones that block scripts fall back to the same download on
// the first CLI invocation (see bin/ani2mal.js).

'use strict'

const { ensureBinary } = require('./download')

ensureBinary({ log: (m) => console.log(m) }).catch((err) => {
  // Not fatal at install time when a package manager merely blocked us or the
  // network is down; the shim will retry on first run.
  console.warn(`ani2mal binary not installed during postinstall: ${err.message.split('\n')[0]}`)
  console.warn('it will be downloaded automatically on first run of "ani2mal"')
})
