# Troubleshooting

**Save writes a download instead of the file.** The browser has no File System Access API (Firefox,
Safari) or the page is not on `https://` or `localhost`. Serve it through HTTPS, or use Chrome or Edge.

**Save asks where to put the file every time after a reload.** A document remembers its disk file only until
the page reloads, and renaming it forgets it too. Open the file again to reconnect it.

**"Browser storage is full or blocked".** Drafts are not being kept. Save your documents to disk, close
tabs you no longer need, or clear the site's data. Private windows may block storage entirely.

**My tabs and settings are gone.** Storage is per browser profile and per site address. A different browser,
a private window, a new hostname or port, or cleared site data starts empty.

**A diagram shows "Mermaid: ...".** The diagram source has an error; the message names it. Diagrams need the
GitHub or Extended flavour; CommonMark shows the source as code.

**Footnotes, `==mark==` or `:emoji:` show as text.** They are in the Extended flavour only.

**The preview is blank for a big document.** Files over 10 MB are refused on open. Very large pasted text
renders slowly; switch to Edit view while writing.

**PDF export prints a blank page.** Print from Preview or Split view; Edit view hides the preview.

**Images do not show.** Only `https:` and inline data images load. `http:` addresses and local file paths
are blocked.

**The page loads but nothing works behind my proxy.** The proxy is probably removing or replacing the
`Content-Security-Policy` header or rewriting paths. The app must be served from the root of its address,
not a sub-path.

**`401` or a login page when it should be open, or `200` when it should ask for a login.** That is your
proxy's authentication, not the app: the app has none. See [Deployment](deployment.md#authentication).

**Container unhealthy.** The health check calls `http://127.0.0.1:8793/healthz` inside the container. If
you set `VGM_LISTEN_ADDR` yourself, keep port 8793 or the check fails.
