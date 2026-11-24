# syntax=docker/dockerfile:1

# Three jobs, in order: bundle and test the TypeScript frontend (stage `web`), test the Go server
# against that bundle (stage `builder`), then ship one static binary with the bundle embedded.
# A failing lint, type check, test or high-severity npm audit stops the image build.

FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx tsc --noEmit && npx eslint . && npx vitest run
RUN npm audit --audit-level=high
# Writes ../internal/web/static/dist, which the builder stage copies in.
RUN node build.mjs

# Go test toolchain, shared by the image build and scripts/test.sh. gcc and musl-dev are for `go test
# -race`, which needs cgo. Nothing is copied here, so scripts/test.sh can build it from a tiny context.
FROM golang:1.27-alpine AS testenv
RUN apk add --no-cache gcc musl-dev

FROM testenv AS builder
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
COPY --from=web /src/internal/web/static/dist ./internal/web/static/dist
RUN go vet ./cmd/... ./internal/...
RUN go test -race ./cmd/... ./internal/...
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/voidgrid-markdown ./cmd/voidgrid-markdown

FROM alpine:3.22
COPY --from=builder /out/voidgrid-markdown /usr/local/bin/voidgrid-markdown
RUN addgroup -g 1000 voidgrid && adduser -D -H -u 1000 -G voidgrid voidgrid
USER 1000:1000
ENV VGM_LISTEN_ADDR=0.0.0.0:8793
EXPOSE 8793
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8793/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/voidgrid-markdown"]
