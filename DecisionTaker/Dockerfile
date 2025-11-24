FROM node:20-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

COPY tsconfig.json ./
COPY src ./src
COPY bindings ./bindings
COPY multisig ./multisig
COPY types ./types

RUN npm run build

FROM node:20-slim AS signer

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4001

ENTRYPOINT ["node", "dist/multisig/signerApi.js"]

FROM node:20-slim AS server

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENTRYPOINT ["node", "dist/src/api/server.js"]

