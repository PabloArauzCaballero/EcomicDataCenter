# syntax=docker/dockerfile:1.7
FROM node:22.16.0-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --non-interactive

FROM dependencies AS build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts
RUN yarn build

FROM node:22.16.0-bookworm-slim AS production-dependencies
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --production=true --non-interactive && yarn cache clean

FROM node:22.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 observatory \
    && useradd --system --uid 10001 --gid observatory --home-dir /app observatory
COPY --from=production-dependencies --chown=observatory:observatory /app/node_modules ./node_modules
COPY --from=build --chown=observatory:observatory /app/dist ./dist
COPY --chown=observatory:observatory package.json ./package.json
USER observatory
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
