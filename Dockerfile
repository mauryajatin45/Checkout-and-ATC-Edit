# Production image for Coolify (Dockerfile build pack).
#
# Multi-stage so build-only tooling never reaches the runtime image:
# esbuild ships a Go binary that Coolify's image scan flags (Go stdlib CVEs),
# and with Railpack the install layer is copied into the image as-is, so
# deleting it during the build step did not help.

FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
# --include=dev: Coolify passes NODE_ENV=production as a build arg, which
# would otherwise skip the build tools (remix, vite) in devDependencies.
RUN npm install --include=dev --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build

# Keep only runtime dependencies, then drop esbuild (only needed to bundle).
RUN npm prune --omit=dev --no-audit --no-fund \
  && rm -rf node_modules/esbuild node_modules/@esbuild \
    node_modules/*/node_modules/esbuild node_modules/*/node_modules/@esbuild \
  && npx --no-install prisma --version >/dev/null

FROM node:22-bookworm-slim
# curl/wget: Coolify runs its health check inside the container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl wget \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
