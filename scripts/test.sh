#!/usr/bin/env bash
# Docker-first test: Vitest in the Node image, then `go test -race ./...` in
# the Dockerfile's `testenv` stage (the same toolchain the image build's test
# gate uses). Playwright browser tests are separate: scripts/e2e.sh.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/_run.sh"
source "$ROOT/scripts/_node.sh"

TESTENV_IMAGE=voidgrid-markdown-testenv

run_logged npm-ci node_install || exit $?
run_logged vitest node_run npm test || exit $?
run_logged npm-audit node_run npm audit --audit-level=high || exit $?
"$ROOT/scripts/bundle.sh" || exit $?

# The testenv stage copies nothing from the build context, so a small
# context directory keeps this fast.
run_logged testenv docker build \
  --target testenv \
  -t "$TESTENV_IMAGE" \
  -f "$ROOT/deploy/docker/Dockerfile" \
  "$ROOT/deploy/docker" || exit $?

mkdir -p "$ROOT/.dev/gocache" "$ROOT/.dev/gomodcache"

run_logged test docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e CGO_ENABLED=1 \
  -e GOCACHE=/cache/go-build \
  -e GOMODCACHE=/cache/gomod \
  -v "$ROOT":/src -w /src \
  -v "$ROOT/.dev/gocache":/cache/go-build \
  -v "$ROOT/.dev/gomodcache":/cache/gomod \
  "$TESTENV_IMAGE" \
  go test -race -v ./cmd/... ./internal/...
status=$?

skipped=$(grep -c '^--- SKIP' "$ROOT/.dev/logs/test.log" || true)
if [ "$skipped" -gt 0 ]; then
  echo "note: $skipped test(s) skipped"
fi

exit "$status"
