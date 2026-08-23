## What

<!-- short description of the change -->

## How verified

- [ ] `make verify` green (lint, fmt, typecheck, purity, tests + coverage gate, build, smokes)
- [ ] No `any` / `!` in `src/` (deno lint)
- [ ] No `TODO`/`Phase N`/ticket refs in comments

## Guardrails

- Domain remains pure (no `node:*` in `src/domain`)
- No `process.exit()` outside `src/cli/index.ts`
- Signals threaded only to IO, never to pure functions
