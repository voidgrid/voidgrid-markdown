#!/usr/bin/env bash
# Docker-first bundle: type-checks and bundles the TypeScript app with esbuild
# into internal/web/static/dist, which the Go binary embeds.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/_run.sh"
source "$ROOT/scripts/_node.sh"

run_logged npm-ci node_install || exit $?
run_logged bundle node_run npm run build
exit $?
