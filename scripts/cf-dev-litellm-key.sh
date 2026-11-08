#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO (project cf-dev). Tạo khóa ảo (virtual key) cho LiteLLM của DEV và lưu vào
# .env.cf-dev dưới tên LITELLM_DEV_KEY. Khóa chỉ được dùng cf-classify/cf-draft (không có model giả)
# và có ngân sách trần 5 USD. KHÔNG in khóa ra màn hình.
# Dùng: ssh cf "cd ~/CommentFlow && bash scripts/cf-dev-litellm-key.sh"
# Chủ dự án chạy lại infra/scripts/print-dev-env.sh để chép LITELLM_API_KEY về .env của máy code.
set -euo pipefail

ENV_FILE="${CF_ENV_FILE:-.env.cf-dev}"
BASE_URL="${LITELLM_URL:-http://localhost:4000}"

get() { grep -m1 -E "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }

if [[ -n "$(get LITELLM_DEV_KEY)" ]]; then
  echo "LITELLM_DEV_KEY đã có trong $ENV_FILE — không tạo lại." >&2
  exit 0
fi

MASTER_KEY="$(get LITELLM_MASTER_KEY)"
if [[ -z "$MASTER_KEY" ]]; then
  echo "Thiếu LITELLM_MASTER_KEY trong $ENV_FILE" >&2
  exit 1
fi

RESPONSE="$(curl -sS -m 30 "$BASE_URL/key/generate" \
  -H "Authorization: Bearer $MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_alias":"cf-dev","models":["cf-classify","cf-draft"],"max_budget":5,"metadata":{"env":"dev"}}')"

KEY="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("key",""))')"
if [[ -z "$KEY" ]]; then
  echo "Tạo khóa thất bại (LiteLLM không trả về khóa). Kiểm tra LiteLLM đang chạy." >&2
  exit 1
fi

umask 077
printf 'LITELLM_DEV_KEY=%s\n' "$KEY" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Đã tạo LITELLM_DEV_KEY (alias cf-dev, cf-classify/cf-draft, trần 5 USD) và lưu vào $ENV_FILE. Giá trị không được in ra."
