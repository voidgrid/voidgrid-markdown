#!/usr/bin/env bash
# Docker-first lint: golangci-lint (pinned, same in every voidgrid Go repo) for
# the Go code, then tsc and ESLint in the Node image for the TypeScript. Markdown: scripts/lint-md.sh.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/_run.sh"
source "$ROOT/scripts/_node.sh"

mkdir -p "$ROOT/.dev/gocache" "$ROOT/.dev/gomodcache" "$ROOT/.dev/lintcache"
status=0
run_logged lint docker run --rm --user "$(id -u):$(id -g)" \
  -e GOCACHE=/cache/go-build -e GOMODCACHE=/cache/gomod -e GOLANGCI_LINT_CACHE=/cache/lint \
  -v "$ROOT":/src -w /src \
  -v "$ROOT/.dev/gocache":/cache/go-build -v "$ROOT/.dev/gomodcache":/cache/gomod -v "$ROOT/.dev/lintcache":/cache/lint \
  golangci/golangci-lint:v2.15.0 golangci-lint run || status=1

run_logged npm-ci node_install || exit $?
run_logged lint-ts node_run npm run lint || status=1
exit $status
