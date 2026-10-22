# The Next.js app: UI, deterministic widget SQL, Aura Analyst proxy.
#
# Build context is the repository root so that the image can be built without a
# separate fixtures copy step; fixtures are still mounted at run time so they can
# be regenerated without a rebuild.

FROM node:22-alpine AS deps
WORKDIR /build
COPY app/package.json app/package-lock.json* ./
# Prefer the lockfile when one is present; fall back for a fresh checkout.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /build/node_modules ./node_modules
COPY app/ ./
# No credentials are needed to build: every secret is read at request time, and
# no NEXT_PUBLIC_* variable carries one. Baking one in here would ship it to the
# browser.
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /demo/app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone bundle carries its own minimal node_modules and server.js.
COPY --from=build /build/.next/standalone ./
COPY --from=build /build/.next/static ./.next/static

# The app holds the database and Analyst credentials, so it runs unprivileged.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
