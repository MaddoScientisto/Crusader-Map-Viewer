FROM node:20-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY Catalogs ./Catalogs

ENV PORT=3000
EXPOSE 3000

FROM base AS dev

CMD ["npm", "start"]

FROM base AS precache

COPY STATIC ./STATIC
COPY STATIC_REGRET ./STATIC_REGRET
RUN npm run build-cache

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=precache /app/package.json ./package.json
COPY --from=precache /app/package-lock.json ./package-lock.json
COPY --from=precache /app/node_modules ./node_modules
COPY --from=precache /app/src ./src
COPY --from=precache /app/Catalogs ./Catalogs
COPY --from=precache /app/.cache ./.cache

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
