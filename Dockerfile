# Multi-stage production image for ComplyLoop (Next.js standalone).
# Build: docker compose --profile app build
# Run:   docker compose --profile app up -d

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/analysis-core/package.json ./packages/analysis-core/
COPY packages/db/package.json ./packages/db/
RUN npm ci

# Runtime-only dependency tree for the runner stage. tsx + dotenv live in
# "dependencies" (not dev) because they run the migration deploy step and the
# assessment worker — keep them there if you touch package.json.
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/analysis-core/package.json ./packages/analysis-core/
COPY packages/db/package.json ./packages/db/
RUN npm ci --omit=dev

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
# Build-time placeholders — runtime env overrides via compose / host.
ENV AUTH_SECRET=build-placeholder
ENV DATABASE_URL=postgres://complyloop:complyloop@postgres:5432/complyloop
RUN npm run build:core && npm run build:db && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/analysis-core/package.json ./packages/analysis-core/package.json
COPY --from=builder /app/packages/analysis-core/dist ./packages/analysis-core/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Local exports point at src/*.ts for Next/tsx. The image ships compiled JS.
RUN node -e "const fs=require('fs'); for (const k of ['analysis-core','db']) { const p=JSON.parse(fs.readFileSync('packages/'+k+'/package.json','utf8')); p.exports=p.publishConfig.exports; delete p.publishConfig; fs.writeFileSync('packages/'+k+'/package.json', JSON.stringify(p,null,2)); }"

USER nextjs
EXPOSE 3000

# Start the app only. Migrations run as a separate deploy step (docker compose
# migrate / an orchestration Job), NOT on every container start — simultaneous
# replica starts would race them. The script is advisory-locked as a safety
# net. DATABASE_URL must point at reachable Postgres.
CMD ["node", "server.js"]
