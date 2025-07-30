# Multi-stage build for NestJS API
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl dumb-init

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create necessary directories with proper permissions
RUN mkdir -p /app/uploads /app/knowledge /app/logs && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check with improved configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main"]