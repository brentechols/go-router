# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app

RUN groupadd --system --gid 10001 go-router \
  && useradd --system --uid 10001 --gid go-router --home-dir /app --shell /usr/sbin/nologin go-router

COPY --from=build --chown=go-router:go-router /app/package.json ./package.json
COPY --from=build --chown=go-router:go-router /app/node_modules ./node_modules
COPY --from=build --chown=go-router:go-router /app/dist ./dist
COPY --from=build --chown=go-router:go-router /app/db ./db

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/server/index.js"]
