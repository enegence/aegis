FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

FROM base AS web-build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared ./packages/shared
COPY web ./web
COPY tsconfig.base.json ./
RUN cd web && npx vite build

FROM base AS server-build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared ./packages/shared
COPY server ./server
COPY tsconfig.base.json ./
RUN cd server && npx tsc

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=web-build /app/server/static ./server/static
COPY server/drizzle ./server/drizzle
COPY packages/shared ./packages/shared

VOLUME /data
ENV AEGIS_DB_PATH=/data/aegis.db
EXPOSE 8000

CMD ["node", "server/dist/index.js"]
