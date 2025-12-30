FROM node:20-slim AS build
WORKDIR /app

ENV CI=true

RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

COPY . .
RUN pnpm install --frozen-lockfile

# build web
RUN pnpm --filter web build

# ---- runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

COPY --from=build /app /app

EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
