# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

FROM base AS dependencies
COPY . .
RUN --mount=type=cache,id=skillforge-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS builder
ENV NODE_ENV=production
RUN pnpm db:generate && pnpm --filter @skillforge/api... build

FROM base AS production-dependencies
COPY . .
RUN --mount=type=cache,id=skillforge-pnpm,target=/pnpm/store \
    pnpm --filter skillforge --filter @skillforge/api... install --prod --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app /app
COPY --from=builder --chown=node:node /app/apps/api/dist /app/apps/api/dist
COPY --from=builder --chown=node:node /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=builder --chown=node:node /app/packages/content-schema/dist /app/packages/content-schema/dist
COPY --from=builder --chown=node:node /app/packages/db/dist /app/packages/db/dist
COPY --from=builder --chown=node:node /app/packages/db/generated /app/packages/db/generated
COPY --from=builder --chown=node:node /app/packages/learning-engine/dist /app/packages/learning-engine/dist

USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=18 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]
