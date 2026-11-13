#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO. Thêm vào `.env.cf-staging` các bí mật DÙNG CHUNG với cf-dev (cùng máy ảo), KHÔNG in giá trị nào ra màn hình:
#   - LITELLM_API_KEY      : khóa ảo LiteLLM RIÊNG cho staging (tạo qua LITELLM_MASTER_KEY của cf-dev; chỉ cf-classify/cf-draft; có trần ngân sách);
#   - MEDIA_S3_ACCESS_KEY / MEDIA_S3_SECRET_KEY : khóa S3 của SeaweedFS (cùng khóa S3_ACCESS_KEY/S3_SECRET_KEY của cf-dev);
# và tạo bucket `cf-media-staging` trên SeaweedFS (tách khỏi bucket ảnh/video của dev).
#
# Dùng:  bash infra/scripts/staging-add-shared-secrets.sh [--budget 10]
# Biến:  CF_ENV_FILE (mặc định ~/CommentFlow/.env.cf-dev), CF_STAGING_ENV_FILE (mặc định ~/cf-staging/.env.cf-staging).
# An toàn: file đích quyền 600; không ghi đè khóa đã có; từ chối nếu file đích nằm trong kho git; giá trị chỉ đi qua biến shell, không qua tham số dòng lệnh.
set -euo pipefail
umask 077

DEV_ENV="${CF_ENV_FILE:-$HOME/CommentFlow/.env.cf-dev}"
OUT="${CF_STAGING_ENV_FILE:-$HOME/cf-staging/.env.cf-staging}"
LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
BUDGET=10
BUCKET="${MEDIA_S3_BUCKET:-cf-media-staging}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --budget) BUDGET="${2:-}"; shift 2 ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Tùy chọn không hợp lệ: $1" >&2; exit 2 ;;
  esac
done
[[ "$BUDGET" =~ ^[0-9]+$ ]] || { echo "--budget phải là số nguyên USD." >&2; exit 2; }
[[ -f "$DEV_ENV" ]] || { echo "Không thấy $DEV_ENV" >&2; exit 1; }
[[ -f "$OUT" ]] || { echo "Không thấy $OUT — chạy infra/scripts/gen-staging-env.sh trước." >&2; exit 1; }
if git -C "$(dirname "$OUT")" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Từ chối: $OUT nằm trong một kho git." >&2
  exit 1
fi

get() { grep -m1 -E "^$2=" "$1" | cut -d= -f2- || true; }
has() { grep -q -E "^$1=.+" "$OUT"; }

added=()

if has LITELLM_API_KEY; then
  echo "LITELLM_API_KEY đã có — giữ nguyên."
else
  MASTER="$(get "$DEV_ENV" LITELLM_MASTER_KEY)"
  [[ -n "$MASTER" ]] || { echo "Thiếu LITELLM_MASTER_KEY trong $DEV_ENV" >&2; exit 1; }
  BODY="$(printf '{"key_alias":"cf-staging","models":["cf-classify","cf-draft"],"max_budget":%s,"budget_duration":"30d","metadata":{"env":"staging"}}' "$BUDGET")"
  RESPONSE="$(curl -sS -m 30 "$LITELLM_URL/key/generate" -H "Authorization: Bearer $MASTER" -H "Content-Type: application/json" -d "$BODY")"
  KEY="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("key",""))')"
  [[ -n "$KEY" ]] || { echo "LiteLLM không trả về khóa (đang chạy chưa? alias cf-staging đã tồn tại?)." >&2; exit 1; }
  printf 'LITELLM_API_KEY=%s\n' "$KEY" >> "$OUT"
  added+=("LITELLM_API_KEY (trần ${BUDGET} USD/30 ngày)")
fi

if has MEDIA_S3_ACCESS_KEY && has MEDIA_S3_SECRET_KEY; then
  echo "MEDIA_S3_* đã có — giữ nguyên."
else
  AK="$(get "$DEV_ENV" S3_ACCESS_KEY)"
  SK="$(get "$DEV_ENV" S3_SECRET_KEY)"
  [[ -n "$AK" && -n "$SK" ]] || { echo "Thiếu S3_ACCESS_KEY/S3_SECRET_KEY trong $DEV_ENV" >&2; exit 1; }
  printf 'MEDIA_S3_ACCESS_KEY=%s\nMEDIA_S3_SECRET_KEY=%s\n' "$AK" "$SK" >> "$OUT"
  added+=("MEDIA_S3_ACCESS_KEY, MEDIA_S3_SECRET_KEY")
fi

chmod 600 "$OUT"

# Bucket ảnh/video riêng của staging (idempotent: đã có thì bỏ qua).
if docker ps --format '{{.Names}}' | grep -q '^cf-dev-seaweedfs-1$'; then
  if docker exec cf-dev-seaweedfs-1 sh -c 'echo "s3.bucket.list" | weed shell -master=localhost:9333 2>/dev/null' | grep -q "[[:space:]]$BUCKET[[:space:]]"; then
    echo "Bucket $BUCKET đã có."
  else
    docker exec cf-dev-seaweedfs-1 sh -c "echo 's3.bucket.create -name $BUCKET' | weed shell -master=localhost:9333" >/dev/null
    echo "Đã tạo bucket $BUCKET."
  fi
else
  echo "Không thấy container cf-dev-seaweedfs-1 — bỏ qua tạo bucket (tạo tay sau)." >&2
fi

if ((${#added[@]} > 0)); then
  echo "Đã thêm vào $OUT: ${added[*]}. Giá trị KHÔNG được in ra."
fi
