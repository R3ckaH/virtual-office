# API image (Railway builds it from railway.json; any container host works).
# Build from the repo root:  docker build -f apps/api/Dockerfile -t vo-api .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @vo/api... 
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @vo/shared build && pnpm --filter @vo/api build
RUN pnpm --filter @vo/api deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 4000
# Apply pending migrations, create the first Admin if BOOTSTRAP_* is set and none exists, then start.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/bootstrap.js && node dist/main.js"]
