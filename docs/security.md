# Security

## What you must add: authentication

voidgrid-markdown has **no authentication and no authorization**. It does not need any to be safe for the
documents (they never reach it), but an open instance still lets strangers use your server's bandwidth and
address, and any browser that loads it can be pointed at documents you did not write. Deploy it only
on a private network, or on the public internet **behind a reverse proxy that requires a login**. See
[Deployment](deployment.md#authentication).

## Where your text goes

- The server only serves the app's own files and `/healthz`, and answers only `GET` and `HEAD`. There is
  no upload, save, sync or telemetry endpoint.
- Documents are kept in the browser's local storage and written to disk by you. Nothing is sent to the
  server, and the Content-Security-Policy blocks the page from connecting anywhere but its own origin.
- The only outside requests are images a document asks for over `https:` (see below).

## Page protections

The server sends on every response:

- `Content-Security-Policy`: scripts only from the app's own files (no inline script, no `eval`), no
  objects, no framing (`frame-ancestors 'none'`), no form posts, no `<base>`, connections to the same
  origin only. Styles may be inline because the editor and Mermaid inject style elements.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy:
  same-origin`, a `Permissions-Policy` turning off camera, microphone and location, and `Cache-Control:
  no-cache`.

## Untrusted documents

Opening a file from someone else must not hurt you, so:

- Every rendered document goes through DOMPurify with extra rules: scripts, event handlers and
  `javascript:` links are removed, along with `style` attributes and elements, forms and form fields (task
  list checkboxes stay, read-only), frames, objects, embeds, `svg` and `math`. Links to other sites open
  with `rel="noopener noreferrer"`. HTML export writes the same sanitized markup.
- Mermaid runs with `securityLevel: strict` and its output is shown as an image (`<img>` with a data
  URI), which the browser treats as inert.
- Exported HTML carries its own policy (`default-src 'none'`, images from `https:` and inline only), so
  it cannot run script wherever it is opened.
- Files over 10 MB or with binary content are refused.

### Remote images

Documents can include images from `https:` addresses, and the preview loads them. A document from an
untrusted source can therefore make your browser request an image from a host it chooses, which reveals
your IP address and that you opened the document. Do not open untrusted documents if that matters.

## Supply chain

- The frontend is bundled in Docker from a committed lockfile; nothing loads from a CDN at run time.
- The test script and the image build fail on any `npm audit` finding of high severity or worse.
- gitleaks scans every commit and the whole history before every push, and again in CI.
- Releases are built only by GitHub Actions on `v*` tags.

## Reporting a problem

Open an issue on the GitHub repository, or for something sensitive contact the maintainer privately
rather than posting details.
