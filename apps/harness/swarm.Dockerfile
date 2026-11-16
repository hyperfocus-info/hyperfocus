FROM node:24.22.0-bookworm-slim AS codex
RUN npm install --global --omit=dev @openai/codex@0.163.0 && codex --version

FROM oven/bun:1.4.3
WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=codex /usr/local/bin/node /usr/local/bin/node
COPY --from=codex /usr/local/lib/node_modules/@openai/codex /opt/codex
RUN ln -s /opt/codex/bin/codex.js /usr/local/bin/codex && codex --version
COPY . .
# Codex subscription authentication is provisioned into the private /data volume
# after deployment; no auth.json or provider API key is baked into this image.
RUN bun install --frozen-lockfile --ignore-scripts
RUN bun apps/harness/scripts/swarm/build-site.ts
ENV NODE_ENV=production
ENV CODEX_HOME=/data/codex
ENV SWARM_SITE_DIR=/app/apps/harness/dist/swarm-site
EXPOSE 8080
CMD ["bun", "apps/harness/cli/src/swarm/service.ts"]
