# ---- Build ----
FROM node:24.18.0-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN pnpm build

# ---- runtime ----
FROM node:24.18.0-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/dist/main.mjs ./main.mjs

USER node
EXPOSE 8056

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8056/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "main.mjs"]
