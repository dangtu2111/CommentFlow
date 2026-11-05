#!/usr/bin/env bash
# CHẠY NGAY TRÊN MÁY ẢO (không chạy ở máy code). Sinh file biến môi trường của staging (`.env.cf-staging`)
# với các bí mật ngẫu nhiên MỚI, riêng cho staging (không dùng lại khóa dev).
#
# Cách dùng (xem docs/STAGING_SETUP.md bước B):
#   infra/scripts/gen-staging-env.sh --domain staging.example.com --email ban@example.com
#   infra/scripts/gen-staging-env.sh --help
#
# Cam kết an toàn:
#   - KHÔNG in bí mật ra màn hình hay log (chỉ in tên biến, đường dẫn, kết quả kiểm định dạng).
#   - File tạo ra có quyền 600 (chỉ chủ file đọc/ghi); thư mục chứa nó 700.
#   - KHÔNG ghi đè file đã có, trừ khi có cờ --overwrite (khi đó bản cũ được sao lưu, quyền 600).
#   - Từ chối ghi vào bên trong một kho git (tránh commit nhầm bí mật).
#   - Agent (Claude/Codex) KHÔNG chạy script này; chủ dự án tự chạy.
#
# Tên biến lấy từ infra/env.cf-staging.example, infra/docker-compose.yml và infra/docker-compose.staging.yml.
set -euo pipefail
umask 077

OUT="${CF_STAGING_ENV_FILE:-$HOME/cf-staging/.env.cf-staging}"
DOMAIN=""
LANGFUSE_EMAIL=""
OVERWRITE=0

usage() {
  cat <<'USAGE'
Sinh .env.cf-staging với bí mật ngẫu nhiên mới.

Tùy chọn:
  --domain <tên miền>   Tên miền công khai của staging, ví dụ staging.example.com (không có https://).
                        Bỏ trống: BETTER_AUTH_URL để trống, bạn điền sau khi có tên miền.
  --email <email>       Email đăng nhập giao diện Langfuse (không bí mật). Bỏ trống: để trống, điền sau.
  --out <đường dẫn>     Nơi ghi file (mặc định: $HOME/cf-staging/.env.cf-staging; hoặc biến CF_STAGING_ENV_FILE).
  --overwrite           Cho phép ghi đè file đã có (bản cũ được sao lưu). NGUY HIỂM: xem cảnh báo dưới.
  -h, --help            Hiện hướng dẫn này.

Cảnh báo --overwrite: mật khẩu DB đã được "đóng" vào volume Postgres lần chạy đầu, và TOKEN_ENC_KEYS mới sẽ
KHÔNG giải mã được token kênh đã lưu. Chỉ dùng khi staging chưa có dữ liệu thật.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) LANGFUSE_EMAIL="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --overwrite) OVERWRITE=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Tùy chọn không hợp lệ: $1 (xem --help)" >&2; exit 2 ;;
  esac
done

if [[ -z "$OUT" ]]; then
  echo "Thiếu đường dẫn --out." >&2
  exit 2
fi

if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
  echo "--domain chỉ gồm chữ, số, dấu chấm, gạch ngang (ví dụ staging.example.com, không có https://)." >&2
  exit 2
fi

if [[ -n "$LANGFUSE_EMAIL" && ! "$LANGFUSE_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
  echo "--email không đúng dạng địa chỉ email." >&2
  exit 2
fi

OUT_DIR="$(dirname "$OUT")"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# Không ghi vào bên trong một kho git: file này tuyệt đối không được commit.
if git -C "$OUT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Từ chối: $OUT_DIR nằm trong một kho git. Chọn thư mục ngoài repo (mặc định \$HOME/cf-staging)." >&2
  exit 1
fi

if [[ -e "$OUT" && "$OVERWRITE" -ne 1 ]]; then
  echo "Đã có $OUT — không ghi đè. (Muốn tạo lại: xem cảnh báo ở --help rồi thêm --overwrite.)" >&2
  exit 1
fi

# n byte ngẫu nhiên → 2n ký tự hex. Dùng openssl nếu có, không thì /dev/urandom. Chỉ in ra stdout cho $( ).
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -vtx1 | tr -d ' \n'
  fi
}

# Mật khẩu dùng hex (24 byte = 48 ký tự): an toàn khi nhúng vào URL kết nối (không có ký tự cần escape).
pw() { rand_hex 24; }

BETTER_AUTH_URL_VALUE=""
[[ -n "$DOMAIN" ]] && BETTER_AUTH_URL_VALUE="https://${DOMAIN}"

TMP="$(mktemp "$OUT_DIR/.env.cf-staging.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

# Mọi giá trị chỉ đi vào file qua heredoc này — không echo ra terminal.
cat >"$TMP" <<EOF
# Sinh bởi infra/scripts/gen-staging-env.sh lúc $(date -u +%Y-%m-%dT%H:%MZ). KHÔNG commit, KHÔNG rời máy ảo.
# Quyền file phải là 600. SAO LƯU TOKEN_ENC_KEYS riêng (trình quản lý mật khẩu), tách khỏi sao lưu DB: mất khóa = mọi kênh phải kết nối lại.

# --- Không phải bí mật ---
CF_DATABASES=commentflow
CF_APP_DATABASE=commentflow
CACHE_NAMESPACE=staging:litellm
IMAGE_TAG=
BETTER_AUTH_URL=${BETTER_AUTH_URL_VALUE}
CLIENT_IP_SOURCE=none
LOG_LEVEL=info
LANGFUSE_PUBLIC_URL=http://localhost:3100
LANGFUSE_INIT_ORG_ID=cf-staging-org
LANGFUSE_INIT_ORG_NAME=CommentFlow Staging
LANGFUSE_INIT_PROJECT_ID=cf-staging-project
LANGFUSE_INIT_PROJECT_NAME=commentflow-staging
LANGFUSE_INIT_USER_EMAIL=${LANGFUSE_EMAIL}
LANGFUSE_INIT_USER_NAME=Owner
SMTP_HOST=
SMTP_PORT=
SMTP_FROM=
SMTP_SECURE=false
META_APP_ID=

# --- Bí mật sinh ngẫu nhiên (mới, riêng cho staging) ---
BETTER_AUTH_SECRET=$(rand_hex 32)
TOKEN_ENC_KEYS=v1:$(rand_hex 32)
POSTGRES_PASSWORD=$(pw)
CF_OWNER_PASSWORD=$(pw)
CF_APP_PASSWORD=$(pw)
CF_AUTH_PASSWORD=$(pw)
LITELLM_DB_PASSWORD=$(pw)
LANGFUSE_DB_PASSWORD=$(pw)
VALKEY_PASSWORD=$(pw)
CLICKHOUSE_PASSWORD=$(pw)
S3_ACCESS_KEY=$(rand_hex 12)
S3_SECRET_KEY=$(pw)
LITELLM_MASTER_KEY=sk-$(rand_hex 24)
LITELLM_SALT_KEY=$(rand_hex 32)
NEXTAUTH_SECRET=$(rand_hex 32)
LANGFUSE_SALT=$(rand_hex 32)
LANGFUSE_ENCRYPTION_KEY=$(rand_hex 32)
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-$(rand_hex 16)
LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-$(rand_hex 24)
LANGFUSE_INIT_USER_PASSWORD=$(pw)

# --- BẠN tự điền (không sinh được): lấy từ nhà cung cấp, xem docs/STAGING_SETUP.md ---
SMTP_USER=
SMTP_PASS=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=$(rand_hex 24)
CLOUDFLARE_TUNNEL_TOKEN=
EOF

# Tự kiểm định dạng (không in giá trị): đúng định dạng repo yêu cầu (packages/connectors/src/token-cipher.ts).
get() { grep -m1 -E "^$1=" "$TMP" | cut -d= -f2-; }
[[ "$(get TOKEN_ENC_KEYS)" =~ ^v1:[0-9a-f]{64}$ ]] || { echo "Lỗi nội bộ: TOKEN_ENC_KEYS sai định dạng." >&2; exit 1; }
[[ "$(get BETTER_AUTH_SECRET)" =~ ^[0-9a-f]{64}$ ]] || { echo "Lỗi nội bộ: BETTER_AUTH_SECRET sai định dạng." >&2; exit 1; }
[[ "$(get LANGFUSE_ENCRYPTION_KEY)" =~ ^[0-9a-f]{64}$ ]] || { echo "Lỗi nội bộ: LANGFUSE_ENCRYPTION_KEY sai định dạng." >&2; exit 1; }

# Sao lưu bản cũ (nếu --overwrite) rồi đặt file mới.
if [[ -e "$OUT" ]]; then
  BACKUP="$OUT.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$OUT" "$BACKUP"
  chmod 600 "$BACKUP"
  echo "Đã sao lưu bản cũ → $BACKUP (quyền 600). Nhớ xóa khi không cần nữa."
fi
mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT

echo "Đã tạo $OUT (quyền 600)."

# Chỉ in TÊN các biến còn trống mà bạn phải điền (hoặc để trống có chủ đích).
EMPTY="$(grep -E '^[A-Z_0-9]+=$' "$OUT" | cut -d= -f1 | tr '\n' ' ')"
echo "Biến còn trống (điền theo docs/STAGING_SETUP.md): ${EMPTY}"
echo "Việc tiếp theo: mở file bằng trình soạn thảo trên máy ảo để điền SMTP_*, (sau này) META_*, CLOUDFLARE_TUNNEL_TOKEN."
