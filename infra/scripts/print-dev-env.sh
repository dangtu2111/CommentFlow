#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO. In ra stdout nội dung `.env` cho MÁY CODE (đúng các biến trong env.example),
# lấy mật khẩu từ ~/CommentFlow/.env.cf-dev. Chủ dự án tự chạy từ terminal của mình:
#   ssh cf "~/CommentFlow/infra/scripts/print-dev-env.sh" > .env
# Agent KHÔNG chạy script này (đầu ra chứa mật khẩu). Lỗi/cảnh báo chỉ ghi ra stderr
# để không lẫn vào file .env khi chuyển hướng.
set -euo pipefail

ENV_FILE="${CF_ENV_FILE:-$HOME/CommentFlow/.env.cf-dev}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Không đọc được $ENV_FILE (chạy scripts/cf-dev-env-init.sh trước)." >&2
  exit 1
fi

# Đọc giá trị một biến từ file env (không `source` để khỏi thực thi nội dung file);
# bỏ cặp nháy bao quanh nếu có.
get() {
  local key="$1" value
  value="$(grep -m1 -E "^${key}=" "$ENV_FILE" | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  if [[ -z "$value" ]]; then
    echo "Thiếu biến $key trong $ENV_FILE" >&2
    exit 1
  fi
  printf '%s' "$value"
}

# Khóa ảo LiteLLM của dev (tuỳ chọn; tạo bằng scripts/cf-dev-litellm-key.sh). Thiếu → để trống.
optional() {
  local value
  value="$(grep -m1 -E "^$1=" "$ENV_FILE" | cut -d= -f2- || true)"
  printf '%s' "${value//\"/}"
}

HOST="$(get LAN_HOST)"
APP_PW="$(get CF_APP_PASSWORD)"
AUTH_PW="$(get CF_AUTH_PASSWORD)"
OWNER_PW="$(get CF_OWNER_PASSWORD)"
CACHE_PW="$(get VALKEY_PASSWORD)"
LITELLM_KEY="$(optional LITELLM_DEV_KEY)"
[[ -z "$LITELLM_KEY" ]] && echo "Lưu ý: chưa có LITELLM_DEV_KEY (chạy scripts/cf-dev-litellm-key.sh trên máy ảo); LITELLM_API_KEY để trống." >&2

cat <<EOF
# Sinh bởi infra/scripts/print-dev-env.sh — KHÔNG commit (đã nằm trong .gitignore).
APP_ENV=dev
LOG_LEVEL=info
WORKER_PORT=3001

DATABASE_URL=postgresql://cf_app:${APP_PW}@${HOST}:5433/cf_dev
DATABASE_ADMIN_URL=postgresql://cf_owner:${OWNER_PW}@${HOST}:5433/cf_dev
DATABASE_AUTH_URL=postgresql://cf_auth:${AUTH_PW}@${HOST}:5433/cf_dev
TEST_DATABASE_URL=postgresql://cf_app:${APP_PW}@${HOST}:5433/cf_test
TEST_DATABASE_ADMIN_URL=postgresql://cf_owner:${OWNER_PW}@${HOST}:5433/cf_test
TEST_DATABASE_AUTH_URL=postgresql://cf_auth:${AUTH_PW}@${HOST}:5433/cf_test

REDIS_URL=redis://:${CACHE_PW}@${HOST}:6380/0
REDIS_KEY_PREFIX=dev:

ML_URL=http://${HOST}:8001
LITELLM_BASE_URL=http://${HOST}:4000
LITELLM_API_KEY=${LITELLM_KEY}
LANGFUSE_HOST=http://${HOST}:3100

SMTP_HOST=${HOST}
SMTP_PORT=1025
SMTP_FROM="CommentFlow AI <no-reply@commentflow.local>"
MAILPIT_URL=http://${HOST}:8025

# Web: BETTER_AUTH_SECRET KHÔNG nằm ở đây — đặt trong .env.local (nạp sau .env, nên chạy lại script này không mất khóa).
BETTER_AUTH_URL=http://localhost:3000
EOF
