# Development

Everything runs in Docker. The host needs Docker and `pre-commit`; no Go or Node.

## Layout

```text
cmd/voidgrid-markdown/    main: the HTTP server
internal/web/             embedded static server, headers, tests
internal/web/static/      index.html, style.css, favicon (dist/ is generated, not tracked)
frontend/src/             TypeScript app (see below)
frontend/tests/           Vitest unit tests
frontend/e2e/             Playwright browser tests
deploy/docker/Dockerfile  build with tests as a gate
examples/                 compose.yaml and .env.example
scripts/                  Docker-first wrappers
```

Frontend modules: `main.ts` (wiring), `editor.ts` (CodeMirror), `flavours.ts` (markdown-it setups),
`render.ts`, `sanitize.ts`, `frontmatter.ts`, `mermaid.ts`, `lint.ts`, `outline.ts`, `stats.ts`,
`commands.ts` (formatting), `files.ts` (open and save), `store.ts` (documents, settings, autosave),
`export.ts`, `dom.ts` (the only place markup is assigned).

Rules the code relies on: no `innerHTML` outside `dom.ts` (ESLint enforces it), all rendered HTML passes
through `sanitize.ts`, no inline script, no network calls from the app.

## Scripts

| Script | Does |
| --- | --- |
| `scripts/lint.sh` | golangci-lint v2.15.0, then `tsc` and ESLint |
| `scripts/lint-md.sh` | markdownlint-cli2 v0.24.2 on the tracked markdown files; `--fix` rewrites what it can |
| `scripts/test.sh` | Vitest, `npm audit`, then the Go tests with `-race` |
| `scripts/e2e.sh` | Builds the image, runs it, drives it with Playwright (headless Chromium) |
| `scripts/bundle.sh` | Type-checks and bundles the frontend into `internal/web/static/dist` |
| `scripts/build.sh` | Bundles, then builds `bin/voidgrid-markdown` |
| `scripts/vet.sh`, `scripts/fmt.sh` | `go vet`, gofumpt |

Each prints only OK or the tail of a failure; full logs are in `.dev/logs/`. Caches live in `.dev/`.

The Playwright image tag is read from the `@playwright/test` version in `frontend/package.json`; update
both together.

## Hooks and CI

`pre-commit install` sets up gitleaks on commit, gitleaks over the whole history on push,
`scripts/lint.sh` and `scripts/lint-md.sh`. Markdown rules are in `.markdownlint-cli2.jsonc` (line length 120, tables compact).

CI has three workflows: `test` (the Dockerfile gate, markdownlint and the Playwright run on every push and
pull request), `gitleaks`, and `release`.

## Tests

- Go: security headers, no inline script or handler in the page, every referenced file embedded,
  read-only methods, health check.
- Vitest: flavour behaviour, XSS payloads in every flavour, front matter, outline, lint, stats, formatting
  commands, export, file name safety, document store recovery.
- Playwright: headers and CSP, rendering, flavour switching, raw HTML, open, drag and drop, Save as,
  Ctrl+S, exports, print view, reload recovery, closing with unsaved changes, problems, outline, toolbar, find.
- **Manual:** save in place uses the browser's native file dialogs, which Playwright cannot drive. In
  Chrome or Edge over `http://localhost:8793`: open a file, edit, press Ctrl+S, confirm the file on disk
  changed; use Save as .md and confirm the new file; rename the document and confirm Save asks for a
  location. Check once in Firefox that Save downloads.

## Releases

Tag `vX.Y.Z` (stable) or `vX.Y.Z-beta.N` (a hyphen means pre-release) and push the tag. The release workflow
builds from `deploy/docker/Dockerfile`, so lint, unit tests, `npm audit`, vet and Go tests must pass, and
pushes `ghcr.io/voidgrid/voidgrid-markdown`. It needs the repo secrets `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` (a read-only token) for base image pulls. Protect `v*` tags so a version never moves.
