# ani2mal: AniList to MyAnimeList sync

> [!IMPORTANT]
> **AI-Assisted Development:** This project is primarily coded with
> [Pi Agent](https://pi.dev) and [OpenCode 2](https://opencode.ai/), using the
> models **DeepSeek V4 Pro 0813**, **GLM 5.2** and **Ox Alpha**.

> Keep MyAnimeList up to date with what you watch and read on AniList.

ani2mal copies your anime and manga lists from AniList to MyAnimeList: scores,
progress, statuses and rewatch counts. It writes to MAL only, never the other
way around, and a dry run shows you every change before anything is saved.

## Install

Grab a self-contained binary from [GitHub Releases](https://github.com/ipmanlk/ani2mal/releases), no runtime needed:

```bash
# linux x64 example; pick the asset matching your platform
curl -fsSL -o ani2mal https://github.com/ipmanlk/ani2mal/releases/latest/download/ani2mal-linux-x64
chmod +x ani2mal && mv ani2mal /usr/local/bin/
```

Or install through npm, which downloads the same binary for your platform:

```bash
npm install -g ani2mal
```

If your package manager blocks install scripts, nothing breaks: the first
`ani2mal` command fetches the missing binary on the spot, verifies its
checksum, and runs.

Working on the source? Run it straight from a checkout with [Deno](https://deno.com):

```bash
deno task run --help
```

## Quick start

```bash
# Export without any MAL account, produces MAL-importer XML
ani2mal export --username Jimmy123 --out ./mal-import

# Sync (needs MAL OAuth once)
ani2mal config set anilist.username=Jimmy123 mal.clientId=YOUR_CLIENT_ID
ani2mal login
ani2mal sync --dry-run --json | jq .
ani2mal sync
```

## Commands

```
ani2mal config get            Print resolved config (secrets redacted)
ani2mal config set <k=v>...   Set anilist.username | mal.clientId | mal.clientSecret
ani2mal config path           Print config directory
ani2mal login [--no-open]     MAL OAuth (PKCE S256)
ani2mal logout                Delete token + pkce files
ani2mal export --username <name> --out <dir> [--mal-username <n>] [--type a|m|both] [--force]
ani2mal sync [--prune] [--dry-run] [--limit <n>] [--only a|m]
ani2mal watch --interval <time> [sync flags]
ani2mal exclude list|add|rm <id>...
```

Global options: `--config-dir <path>` `--json` `--quiet` `--verbose` `--non-interactive`

The binaries ship with their permissions baked in: network access limited to the
AniList and MAL hosts, file access scoped to the config dir and `--out`, and
browser opening restricted to the platform opener (`open`, `xdg-open` or `cmd`).

## Fresh install (no migration from 2.x/3.x)

`ani2mal` 4.0 ships as a self-contained binary. If you used an older npm-installed
version, install 4.0 fresh and re-run:

```bash
ani2mal config set anilist.username=... mal.clientId=... mal.clientSecret=...
ani2mal login
```

No config file is migrated; 4.0 starts clean by design.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success, no-op, cancelled, --help/--version |
| 2 | Usage, config, auth |
| 3 | Network / API failure after retries |
| 10 | Partial sync, some writes failed |

## Development

```bash
mise install        # pulls Deno via mise
make verify         # lint → fmt → typecheck → purity → tests+coverage → build → smokes
```

## License

MIT
