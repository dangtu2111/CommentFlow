#!/usr/bin/env bash
# Sinh file bí mật .env.cf-dev cho project cf-dev NGAY TRÊN MÁY ẢO (chạy một lần).
# - Không in giá trị bí mật ra màn hình, không ghi ra nơi nào khác ngoài file đích (chmod 600).
# - Không ghi đè nếu file đã tồn tại (tránh làm hỏng DB đã khởi tạo bằng mật khẩu cũ).
# - Tên biến + mô tả: infra/env.cf-dev.example
# Dùng: ssh cf "cd ~/CommentFlow && bash scripts/cf-dev-env-init.sh"
set -euo pipefail

TARGET="${1:-.env.cf-dev}"
LAN_HOST="${CF_LAN_HOST:-192.168.1.124}"

if [[ -e "$TARGET" ]]; then
  echo "$TARGET đã tồn tại — không ghi đè. Xóa file thủ công nếu thật sự muốn sinh lại." >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }

umask 077
cat > "$TARGET" <<EOF
# Sinh tự động bởi scripts/cf-dev-env-init.sh — KHÔNG commit, KHÔNG chép về máy code.
CF_DATABASES=cf_dev cf_test
CACHE_NAMESPACE=dev:litellm
LAN_HOST=${LAN_HOST}
LANGFUSE_PUBLIC_URL=http://${LAN_HOST}:3100

POSTGRES_PASSWORD=$(hex 24)
CF_OWNER_PASSWORD=$(hex 24)
CF_APP_PASSWORD=$(hex 24)
LITELLM_DB_PASSWORD=$(hex 24)
LANGFUSE_DB_PASSWORD=$(hex 24)

VALKEY_PASSWORD=$(hex 24)
CLICKHOUSE_PASSWORD=$(hex 24)
S3_ACCESS_KEY=$(hex 10)
S3_SECRET_KEY=$(hex 24)

LITELLM_MASTER_KEY=sk-$(hex 24)
LITELLM_SALT_KEY=sk-$(hex 24)

NEXTAUTH_SECRET=$(hex 32)
LANGFUSE_SALT=$(hex 32)
LANGFUSE_ENCRYPTION_KEY=$(hex 32)
LANGFUSE_INIT_ORG_ID=cf-dev-org
LANGFUSE_INIT_ORG_NAME=CommentFlow Dev
LANGFUSE_INIT_PROJECT_ID=cf-dev
LANGFUSE_INIT_PROJECT_NAME=cf-dev
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-$(hex 16)
LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-$(hex 16)
LANGFUSE_INIT_USER_EMAIL=dev@commentflow.local
LANGFUSE_INIT_USER_NAME=Dev
LANGFUSE_INIT_USER_PASSWORD=$(hex 12)
EOF
chmod 600 "$TARGET"
echo "Đã tạo $TARGET (quyền 600, $(grep -c '=' "$TARGET") biến). Giá trị không được in ra."
