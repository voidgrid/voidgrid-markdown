#!/usr/bin/env bash
# Browser tests: builds the real image, runs it on a private Docker network and
# drives it with Playwright (headless Chromium) from the Playwright image.
# The Playwright image tag must match the @playwright/test version in
# frontend/package.json.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/_run.sh"

APP_IMAGE=voidgrid-markdown-e2e
NET=voidgrid-markdown-e2e
APP=voidgrid-markdown-e2e-app
PW_VERSION="$(sed -n 's/.*"@playwright\/test": *"[^0-9]*\([0-9][0-9.]*\)".*/\1/p' "$ROOT/frontend/package.json")"
if [ -z "$PW_VERSION" ]; then
  echo "e2e: cannot read the @playwright/test version from frontend/package.json" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$APP" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

run_logged e2e-image docker build -t "$APP_IMAGE" -f "$ROOT/deploy/docker/Dockerfile" "$ROOT" || exit $?
docker network create "$NET" >/dev/null || exit $?
docker run -d --name "$APP" --network "$NET" -e VGM_LISTEN_ADDR=0.0.0.0:8793 "$APP_IMAGE" >/dev/null || exit $?

mkdir -p "$ROOT/.dev/e2e-results"
run_logged e2e docker run --rm --network "$NET" --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e BASE_URL="http://$APP:8793" \
  -e PW_VERSION="$PW_VERSION" \
  -v "$ROOT/frontend":/work:ro \
  "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  sh -c 'set -e; mkdir /tmp/pw; cp -r /work/e2e /work/playwright.config.ts /tmp/pw; cd /tmp/pw; npm init -y >/dev/null; npm install --no-audit --no-fund "@playwright/test@$PW_VERSION"; npx playwright test'
exit $?
