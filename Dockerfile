FROM node:22-slim

WORKDIR /app

# Install dependencies first so this layer caches across code changes.
COPY package.json package-lock.json ./
RUN npm ci

# Build the Next.js app.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
# SQLite needs a writable directory. Set TRADIA_DB_PATH to a writable path on
# the host: a mounted volume for persistence, or /tmp on ephemeral free tiers
# (where scripts/bootstrap.mjs re-provisions the account on each boot).
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "run", "start"]
