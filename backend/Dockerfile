# ---- Build stage ----
FROM node:20.15-alpine3.19 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ---- Production stage ----
FROM node:20.15-alpine3.19 AS production
# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Security: remove unnecessary packages
RUN apk update && \
    apk add --no-cache dumb-init && \
    apk del apk-tools && \  
    rm -rf /var/cache/apk/*

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
