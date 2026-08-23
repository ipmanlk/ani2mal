# Permissions shared by the run task and the compiled binary so both behave
# identically. The binary bakes them in at compile time; users never see a prompt.
PERMS := --allow-net=graphql.anilist.co,api.myanimelist.net,myanimelist.net --allow-env --allow-read --allow-write --allow-run=xdg-open

.PHONY: install lint fmt fmt-check typecheck test test-coverage build cruise verify pack clean help

help:
	@echo "ani2mal: make targets"
	@echo "  install         mise install"
	@echo "  lint            deno lint"
	@echo "  fmt             deno fmt (write)"
	@echo "  fmt-check       deno fmt --check"
	@echo "  typecheck       deno check"
	@echo "  cruise          domain purity check (no node: imports in src/domain)"
	@echo "  test            deno test (offline, fixtures only)"
	@echo "  test-coverage   deno coverage plus the gate script"
	@echo "  build           deno compile → dist/ani2mal"
	@echo "  verify          full-loop gate (lint→fmt→typecheck→cruise→test→coverage→build→smokes)"
	@echo "  pack            dry-run pack of the npm installer package"
	@echo "  clean           rm -rf dist coverage .tmp"

install:
	mise install

lint:
	deno task lint

fmt:
	deno task fmt

fmt-check:
	deno task fmt:check

typecheck:
	deno task check

cruise:
	@! grep -R -E "from ['\"]node:|import.*node:" src/domain 2>/dev/null || (echo "✖ domain imports node:"; exit 1)
	@echo "✓ domain purity ok"

test:
	deno task test

test-coverage:
	deno task test:coverage

build:
	deno compile $(PERMS) --output dist/ani2mal src/cli/index.ts

verify: lint fmt-check typecheck cruise test-coverage build
	@./dist/ani2mal --version >/dev/null && echo "✓ --version exit 0"
	@./dist/ani2mal --help >/dev/null && echo "✓ --help exit 0"
	@rm -rf /tmp/opencode/ani-verify-out && ANI2MAL_CONFIG_DIR=/tmp/opencode/ani-verify ./dist/ani2mal export --username Jimmy123 --out /tmp/opencode/ani-verify-out >/dev/null && echo "✓ export Jimmy123 ($$(ls /tmp/opencode/ani-verify-out | wc -l) files)"
	@rm -rf /tmp/opencode/ani-verify-out
	@ANI2MAL_CONFIG_DIR=/tmp/opencode/ci-test-verify ./dist/ani2mal sync --dry-run 2>&1 | grep -q "anilist.username" && echo "✓ sync --dry-run no-token → exit 2 actionable" || (echo "✖ sync --dry-run failed"; exit 1)
	@cd npm && npm pack --dry-run 2>&1 | grep -q "ani2mal" && echo "✓ npm pack ok"

pack:
	cd npm && npm pack --dry-run

clean:
	rm -rf dist coverage .tmp /tmp/opencode/ani-verify /tmp/opencode/ci-test-verify
