# voidgrid-markdown

A markdown editor for the browser, in the voidgrid terminal style: open a file from disk, edit it with a
live preview, save it back or download it as `.md`. It replaces Dillinger, which is out of date and has
known security problems. Everything runs in your browser; the server only hands out the static app, and
no document is ever sent to it.

I wrote this using Claude. Dillinger is out of date and I wanted a markdown editor that I could run myself, so I
designed what I wanted (what it opens, how it saves, how it stays in the browser) and Claude wrote the code. I am
not a Go or frontend developer and I have not read all of it. I don't trust purely vibe coded projects and neither
should you. This is a one person plus AI project built for my own homelab, so you probably shouldn't use it. If you
do anyway, I advise, very strongly, to read the code before trusting it. I am not asking you to trust me at all, as
I am using Claude, so for the love of God dig into the code yourself and understand it before running it. For all
you know it could get your fridge pregnant, turn your toaster into a Transformer, cause your significant other to
expect you to actually do the dishes, or summon Abraxas in the middle of your bathroom whilst you are showering,
and I wouldn't want you blaming me for any of that.

Also I suck at writing README.md stuff...

> **There is no authentication.** Anyone who can reach the port can use the editor. Run it on a private
> network, or, if it is reachable from the internet, **only behind a reverse proxy that requires a login**
> (basic auth, Authelia, oauth2-proxy and the like). See [docs/deployment.md](docs/deployment.md#authentication).

## Documentation

- [Using the editor](docs/using.md): files, saving, flavours, validator, shortcuts
- [Deployment](docs/deployment.md): compose, `.env`, reverse proxy with authentication, upgrades
- [Security](docs/security.md) and [Troubleshooting](docs/troubleshooting.md)
- [Development](docs/development.md): scripts, tests, releases

## Quick start

```sh
cd examples
cp .env.example .env
docker compose up -d
```

Open `http://localhost:8793`. The sample [`compose.yaml`](examples/compose.yaml) publishes the port on
`127.0.0.1` only; see [`.env.example`](examples/.env.example) for its settings.

## Features

- **Three flavours**, switchable per session: CommonMark (strict), GitHub (GFM: tables, task lists,
  strikethrough, autolinks, alerts), and Extended (GFM plus footnotes, definition lists, sub/superscript,
  mark, abbreviations, emoji and `::: note|tip|info|warning|danger` containers).
- **Preview** with syntax-highlighted code, YAML front matter (shown as a table), and Mermaid diagrams
  in fenced `mermaid` blocks (GFM and Extended; CommonMark shows them as code, as the spec says).
- **Files:** open from disk, save in place, **Save as .md**, drag and drop onto the window, export to
  styled standalone HTML, and PDF through the browser's print dialog.
- **Several documents** in tabs, autosaved to the browser's storage and recovered after a reload or crash.
- **Validator:** markdownlint runs as you type, with markers in the editor and a problems panel that
  jumps to the line.
- **Editing:** formatting toolbar and shortcuts (Ctrl+B, Ctrl+I, Ctrl+E, Ctrl+K), find and replace
  (Ctrl+F), heading outline, word, character and reading-time counts, and synced scrolling.

### Saving to disk

| Browser | Open | Save | Save as .md |
| --- | --- | --- | --- |
| Chrome, Edge (File System Access API) | native Open dialog | writes back to the same file | native Save dialog |
| Firefox, Safari | file input | downloads the file | downloads the file |

Save in place needs a secure context: `https://` or `http://localhost`. A document opened by drag and drop
has no file to write back to, so its first Save asks where to put it. Reloading the page keeps the draft
but forgets which disk file it came from; the next Save asks again.

## Deployment

Image: `ghcr.io/voidgrid/voidgrid-markdown`, built by GitHub Actions on version tags. `:beta` follows every
tag, `:latest` only stable ones, and each tag (e.g. `:v0.1.0`) is fixed.

### Requirements

- **A reverse proxy with authentication and HTTPS** for anything but your own machine. The app has no
  login of its own, and the browser offers save in place only on `https://` or `localhost`.
- Nothing else: no database, no volume, no outgoing connections. The image runs as uid/gid `1000:1000`.

### Settings

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `VGM_LISTEN_ADDR` | no | `127.0.0.1:8793` (`0.0.0.0:8793` in the image) | Address the app listens on |

### Compose

See [`examples/compose.yaml`](examples/compose.yaml) and [`examples/.env.example`](examples/.env.example).
Route the proxy to port `8793`. The image has a healthcheck on `/healthz`. Full details, including proxy
examples with authentication, are in [docs/deployment.md](docs/deployment.md).

## Security

- Strict Content-Security-Policy: scripts only from the app's own files, no inline script, no objects, no
  framing, no form posts. Styles may be inline because the editor and Mermaid inject them. Images may load
  from `https:` so a document's remote pictures show; a document you did not write can therefore make
  your browser fetch an image from its host.
- Every rendered document goes through DOMPurify with extra rules: no `style` attributes or elements, no
  forms or form fields (task list checkboxes excepted), no frames, objects or embeds. Links to other sites
  open with `rel="noopener noreferrer"`. The same sanitized HTML is what Export writes.
- Mermaid runs in `strict` mode and its output is shown as an image, which the browser treats as inert.
- Exported HTML carries its own policy (`default-src 'none'`), so it cannot run script wherever it is opened.
- The server answers only GET and HEAD, and the frontend build fails on `npm audit` findings of high severity.

## Development

Everything runs in Docker; nothing is needed on the host but Docker and `pre-commit`.

```sh
scripts/lint.sh    # golangci-lint (Go) and tsc + ESLint (TypeScript)
scripts/test.sh    # Vitest, npm audit, then the Go tests
scripts/e2e.sh     # builds the image and runs the Playwright browser tests against it
scripts/build.sh   # bundles the frontend and builds bin/voidgrid-markdown
scripts/fmt.sh     # gofumpt
```

Install the hooks with `pre-commit install`: gitleaks on commit and on push (whole history), and the lint
script.

The frontend is TypeScript in `frontend/src`, bundled by esbuild into `internal/web/static/dist` (not
tracked), which the Go binary embeds. `internal/web/static` holds the page and its stylesheet.

### Manual check: save in place

The native pickers need a real dialog, so Playwright cannot drive them. Before a release, in Chrome or Edge
over `http://localhost:8793`: Open a file, edit, press Ctrl+S and confirm the file on disk changed; use
Save as .md and confirm the new file; rename the document and confirm Save asks where to put it.

## License

MIT, see [LICENSE](LICENSE).
