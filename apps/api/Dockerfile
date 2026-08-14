# Build with the repo root as context:
#   docker build -f apps/api/Dockerfile -t spiderman-api .

FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN npx --yes turbo@2 prune --docker @spiderman/api

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
COPY tsconfig.base.json .
RUN pnpm turbo build --filter=@spiderman/api

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/api ./apps/api
COPY --from=builder /repo/package.json ./package.json
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/repo/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
