# API image for Azure App Service (Linux) / Container Apps.
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
# Apply pending migrations, then start. (Run migrations as a separate release step if you scale out.)
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
