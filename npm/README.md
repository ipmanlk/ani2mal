# ani2mal (npm installer)

This package is a thin installer. `postinstall` downloads the self-contained
ani2mal binary for your platform from the [GitHub release](https://github.com/ipmanlk/ani2mal/releases)
matching this package's version, checks it against the published sha256, and
the `ani2mal` bin launches it.

No JavaScript runs at CLI time beyond the launch, and no runtime is needed
after the download.

The `ani2mal` bin is self-healing. Package managers that block lifecycle
scripts (pnpm, Yarn, `npm --ignore-scripts`) skip the postinstall download;
the first CLI invocation then notices the missing binary, fetches it, verifies
the checksum, and carries on. The download only ever happens when the binary
is absent or stamped with an older version.

Environment overrides:

- `ANI2MAL_SKIP_DOWNLOAD=1` skips the download entirely (distro packagers).
- `ANI2MAL_FORCE_DOWNLOAD=1` re-downloads even if the binary exists.
- `ANI2MAL_BINARY=/path/to/ani2mal` runs any binary you supply instead.

See the repository README for usage.
