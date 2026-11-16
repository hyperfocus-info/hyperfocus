FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN bun build apps/swarm-worker/src/server.ts --target node --format esm --external railway --outfile /out/server.mjs

FROM node:24.22.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY apps/swarm-worker/deployment/package.json apps/swarm-worker/deployment/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /out/server.mjs ./server.mjs
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
