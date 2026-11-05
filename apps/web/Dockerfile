# syntax=docker/dockerfile:1
# Image web (Next.js `output: standalone`) cho cf-staging. Ngữ cảnh build = GỐC repo:
#   docker build -f apps/web/Dockerfile -t cf/web:local .
# Không chứa bí mật: mọi biến môi trường truyền lúc chạy (infra/env.cf-staging.example). Xem docs/staging/H5-CHECKLIST.md.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# pnpm theo trường packageManager của package.json (corepack)
RUN corepack enable
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@flow/web..."
RUN NODE_ENV=production pnpm --filter @flow/web run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# standalone đã gom node_modules cần thiết; outputFileTracingRoot = gốc monorepo nên server nằm ở apps/web/server.js
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
