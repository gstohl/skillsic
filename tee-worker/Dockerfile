# Multi-stage build for the skillsic TEE worker
# Deployed to Phala Cloud CVM (Confidential VM)

FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:22-slim AS runner

WORKDIR /app

# Only copy production deps and built files
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist/ ./dist/

# Expose the worker port
EXPOSE 3000

# Run the worker
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
