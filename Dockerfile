# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm" PATH="/pnpm:${PATH}"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN pnpm build:migrate

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist/migrate.js ./dist/migrate.js
RUN printf '#!/bin/sh\nset -e\nif [ "${RUN_MIGRATIONS:-false}" = "true" ]; then\n  node dist/migrate.js\nfi\nexec "$@"\n' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const c=new AbortController();setTimeout(()=>c.abort(),4000);fetch('http://127.0.0.1:3000/api/health',{signal:c.signal}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]