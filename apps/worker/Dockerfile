# syntax=docker/dockerfile:1
# Image worker (pg-boss) cho cf-staging. Ngữ cảnh build = GỐC repo:
#   docker build -f apps/worker/Dockerfile -t cf/worker:local .
# Worker và các gói nội bộ chạy thẳng từ mã nguồn TypeScript bằng `tsx` (không có bước build riêng, như ở dev).
# Không chứa bí mật: biến môi trường truyền lúc chạy (infra/env.cf-staging.example).

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable
COPY . .
# Chỉ worker + các gói nó phụ thuộc (@flow/db, @flow/shared, @flow/connectors)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@flow/worker..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    WORKER_PORT=3001
WORKDIR /app
COPY --from=deps --chown=node:node /app /app
USER node
WORKDIR /app/apps/worker
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.WORKER_PORT||3001)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["./node_modules/.bin/tsx", "src/main.ts"]
