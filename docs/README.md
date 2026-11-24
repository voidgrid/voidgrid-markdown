# voidgrid-markdown documentation

- [Using the editor](using.md): documents, files and saving, flavours, preview, validator, shortcuts.
- [Deployment](deployment.md): image, compose, `.env`, reverse proxy with authentication, health check, upgrades.
- [Security](security.md): what the app protects against, what it does not, and what you must add.
- [Development](development.md): layout, scripts, tests, releases.
- [Troubleshooting](troubleshooting.md)

> **There is no authentication.** Anyone who can reach the port can use the editor. Only deploy it on the
> public internet behind a reverse proxy that requires a login. See [Deployment](deployment.md#authentication).
