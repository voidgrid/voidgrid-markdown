#!/usr/bin/env bash
# Docker-first fmt: gofumpt for Go (via the official Go image) and prettier-free
# TypeScript is left to ESLint, so only Go is rewritten here.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/_run.sh"

mkdir -p "$ROOT/.dev/gocache" "$ROOT/.dev/gomodcache"

run_logged fmt docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e GOCACHE=/cache/go-build \
  -e GOMODCACHE=/cache/gomod \
  -v "$ROOT":/src -w /src \
  -v "$ROOT/.dev/gocache":/cache/go-build \
  -v "$ROOT/.dev/gomodcache":/cache/gomod \
  golang:1.27-alpine \
  go run mvdan.cc/gofumpt@v0.12.0 -l -w ./cmd ./internal
exit $?
