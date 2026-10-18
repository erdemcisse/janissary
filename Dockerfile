# Phase 8e-20/8e-21: one image carrying the API server, the landing static
# export (web/out), and the game client build (client/dist + public, base
# /play/). Caddy (docker-compose) serves /app/www and proxies API/WS to :9001.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY tools/package.json tools/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY shared shared
COPY server server
RUN pnpm --filter @janissary/server build \
  && pnpm --filter @janissary/server deploy --prod /prod/server

FROM node:22-bookworm-slim AS landing
WORKDIR /app
COPY --from=build /app /app
COPY web web
# The landing is a static export (ADR 0013); NEXT_PUBLIC_SITE_ORIGIN must be
# the real production domain (deploy.sh writes it into the build args).
ARG NEXT_PUBLIC_SITE_ORIGIN=https://janissary.example
ENV NEXT_PUBLIC_SITE_ORIGIN=${NEXT_PUBLIC_SITE_ORIGIN}
RUN pnpm --filter @janissary/web build

FROM node:22-bookworm-slim AS game
WORKDIR /app
COPY --from=build /app /app
COPY client client
# The game client builds with base /play/ so Caddy can serve the landing at
# "/" and the game at "/play" from one static root. public/ content (textures,
# audio, models, ui, fonts) ships beside dist under /play/.
RUN pnpm --filter @janissary/client build \
  && mkdir -p /app/play \
  && cp -r client/dist/. /app/play/ \
  && cp -r client/public/. /app/play/

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=9001 DB_PATH=/app/data/janissary.db
WORKDIR /app
COPY --from=build /prod/server ./
# Static web roots for Caddy (read via volumes_from in docker-compose).
COPY --from=landing /app/web/out /app/www/landing
COPY --from=game /app/play /app/www/play
RUN mkdir -p /app/data && chown node:node /app/data
EXPOSE 9001
USER node
CMD ["node", "dist/index.js"]
