# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ---- Production stage ----
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Security: pull latest Alpine security patches (base image can lag behind
# its own package index between rebuilds), then install dumb-init
# Not version-pinned: node:20-alpine floats to whatever Alpine release is
# current, and old apk package versions get pruned from the mirror — a
# hardcoded version here would eventually break the build on rebuild.
# hadolint ignore=DL3018
RUN apk --no-cache upgrade && apk --no-cache add dumb-init

# Security: strip the npm CLI bundled in the base image — production only
# ever runs `node src/index.js`, never npm/npx. Its own transitive deps
# (tar, minimatch, cross-spawn, etc.) otherwise show up as CVEs in image
# scans despite the app never invoking them.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /app

# Copy only production dependencies from build stage
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/

# Security: own files by non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

# Security: use dumb-init for proper signal handling (PID 1 problem)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
