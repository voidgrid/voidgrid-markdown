#!/usr/bin/env bash
# Shared helper, sourced by the other scripts/<tool>.sh wrappers: runs a
# command in the pinned Node image against ./frontend, so no Node is needed
# on the host. Needs ROOT set and scripts/_run.sh sourced first.
# Not meant to be run directly.

NODE_IMAGE=node:22-alpine

node_run() {
  mkdir -p "$ROOT/.dev/npm"
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -e npm_config_cache=/src/.dev/npm \
    -e npm_config_update_notifier=false \
    -v "$ROOT":/src -w /src/frontend \
    "$NODE_IMAGE" "$@"
}

# npm ci, skipped when node_modules was already installed from this exact lockfile.
node_install() {
  local stamp="$ROOT/frontend/node_modules/.lock-sha256"
  local want
  want="$(sha256sum "$ROOT/frontend/package-lock.json" | cut -d' ' -f1)"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ]; then
    return 0
  fi
  node_run npm ci --no-audit --no-fund || return $?
  echo "$want" >"$stamp"
}
