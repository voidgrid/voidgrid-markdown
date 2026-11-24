# Deployment

> **voidgrid-markdown has no authentication and no user accounts.** Anyone who can reach its port can load
> the editor. Never publish it on the internet directly. Put it behind a reverse proxy that requires a
> login, as described under [Authentication](#authentication).

The app holds no data: no database, no volume, no outgoing connections. Documents live in each user's
browser and on their disk, so there is nothing to back up.

## Requirements

- Docker with Compose.
- A reverse proxy with TLS **and authentication** for anything beyond your own machine. HTTPS is also
  needed for save in place: browsers offer it only on `https://` or `http://localhost`.

## Image

`ghcr.io/voidgrid/voidgrid-markdown`, built by GitHub Actions on version tags (`v*`).

| Tag | Follows |
|---|---|
| `:v0.1.0` | That exact version; never moves |
| `:beta` | Every tag, including pre-releases such as `v0.1.0-beta.1` |
| `:latest` | Stable tags only (no hyphen) |

The image is a single static binary running as uid/gid `1000:1000`. It needs no volume and can run with a
read-only root filesystem.

## Compose and `.env`

Copy [`examples/compose.yaml`](../examples/compose.yaml) and [`examples/.env.example`](../examples/.env.example)
into one folder, rename the second to `.env`, and start it:

```
cp .env.example .env
docker compose up -d
```

`.env` settings (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `VGM_IMAGE_TAG` | `beta` | Image tag to run |
| `VGM_BIND` | `127.0.0.1` | Host address the port binds to. Keep it on loopback when the proxy runs on the same host |
| `VGM_PORT` | `8793` | Host port mapped to the container's 8793 |
| `TZ` | `Etc/UTC` | Time zone for log times |

Inside the container the app reads one setting:

| Variable | Default | Meaning |
|---|---|---|
| `VGM_LISTEN_ADDR` | `127.0.0.1:8793` (the image sets `0.0.0.0:8793`) | Address the server listens on |

The example compose file also drops all capabilities, sets `no-new-privileges` and mounts the root
filesystem read-only. Change `VGM_BIND` to a LAN or Docker-network address only when a firewall limits who
can reach it.

If the proxy is itself a container, drop the `ports:` entry, put both on one Docker network, and point the
proxy at `voidgrid-markdown:8793`.

## Authentication

The proxy must authenticate every request, including static files and `/healthz` if it is reachable from
outside. Choose what fits your setup:

- **Basic auth** in the proxy: simplest for one person or a small group.
- **An identity-aware proxy** (Authelia, Authentik, oauth2-proxy, Cloudflare Access, Tailscale, and the
  like) for single sign-on, MFA and per-user rules.
- **A VPN or private network** instead of a public address.

### Caddy (basic auth)

Generate a password hash with `caddy hash-password`, then:

```
markdown.example.com {
	basic_auth {
		alice <hash from caddy hash-password>
	}
	reverse_proxy 127.0.0.1:8793
}
```

### nginx (basic auth)

Create the file with `htpasswd -c /etc/nginx/markdown.htpasswd alice`, then:

```
server {
    listen 443 ssl;
    server_name markdown.example.com;
    # ssl_certificate and ssl_certificate_key as usual

    auth_basic "voidgrid-markdown";
    auth_basic_user_file /etc/nginx/markdown.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:8793;
        proxy_set_header Host $host;
    }
}
```

Both examples are starting points; check them against your proxy's version and your own TLS setup. Do not
disable the app's security headers (CSP and the rest): add yours, do not replace them. Proxies that
rewrite `Content-Security-Policy` should leave it alone.

### Check it

From a machine that is not logged in:

```
curl -sI https://markdown.example.com/ | head -1
```

It should answer `401` or redirect to your login page, not `200`. If it answers `200`, the editor is open
to the world.

## Health check

`GET /healthz` returns `ok`. The image uses it for its Docker health check. If you monitor it through the
proxy, exempt only that path from authentication, and only for your monitor's address.

## Upgrading

```
docker compose pull
docker compose up -d
```

Pin `VGM_IMAGE_TAG` to a version to control when changes arrive. Users' drafts are stored in their
browsers and survive an upgrade; a new site address (a different hostname or port) starts with empty
storage.

## Several users

The server is stateless, so any number of people can use one instance. Their documents stay in their own
browsers. Two people sharing one browser profile on the same address also share drafts.
