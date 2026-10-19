FROM node:22-alpine AS frontend

WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY public ./public
RUN pnpm build

FROM golang:1.27-alpine AS backend

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sloop ./cmd/sloop \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sloop-admin ./cmd/sloop-admin

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tini \
    && addgroup -S sloop \
    && adduser -S -G sloop -h /app sloop \
    && mkdir -p /app /data \
    && chown sloop:sloop /data

COPY --from=backend /out/sloop /app/sloop
COPY --from=backend /out/sloop-admin /app/sloop-admin
COPY --from=frontend /src/public /app/public

WORKDIR /app
USER sloop

ENV PORT=2167 \
    SLOOP_DATABASE_PATH=/data/sloop.db \
    SLOOP_SECRET_FILE=/data/signing-secret \
    SLOOP_STATIC_DIR=/app/public \
    DEFAULT_TIMEZONE=Asia/Shanghai

EXPOSE 2167
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/sloop"]
