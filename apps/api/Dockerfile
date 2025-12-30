FROM node:20-slim AS build
WORKDIR /app

ENV CI=true

RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

COPY . .
RUN pnpm install --frozen-lockfile

# generate prisma client inside the image
RUN cd apps/api && pnpm exec prisma generate

# build api (nest)
RUN pnpm --filter api build

# ---- runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

COPY --from=build /app /app

EXPOSE 3000
CMD ["pnpm", "--filter", "api", "start:prod"]
