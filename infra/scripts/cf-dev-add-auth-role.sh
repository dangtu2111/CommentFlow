#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO (qua `pnpm cf:dev add-auth-role`). Thêm role `cf_auth` vào Postgres cf-dev ĐÃ khởi tạo
# (script khởi tạo 10-roles-and-databases.sh chỉ chạy khi volume trống). Idempotent:
#  - sinh CF_AUTH_PASSWORD vào ~/CommentFlow/.env.cf-dev nếu chưa có (không in ra);
#  - tạo role nếu chưa có, hoặc đặt lại mật khẩu cho khớp .env.cf-dev;
#  - cấp CONNECT vào các database ứng dụng trong CF_DATABASES.
# Bảng nào cf_auth được chạm do migration 0010 quyết định, KHÔNG phải script này.
# Chỉ project cf-dev. Không in bí mật.
set -euo pipefail

ENV_FILE=".env.cf-dev"
COMPOSE=(docker compose -p cf-dev --env-file "$ENV_FILE" -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Không đọc được $ENV_FILE (chạy scripts/cf-dev-env-init.sh trước)." >&2
  exit 1
fi

get() { grep -m1 -E "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true; }

if [[ -z "$(get CF_AUTH_PASSWORD)" ]]; then
  umask 077
  printf 'CF_AUTH_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> "$ENV_FILE"
  echo "Đã thêm CF_AUTH_PASSWORD vào $ENV_FILE (không in giá trị)."
fi
PW="$(get CF_AUTH_PASSWORD)"
DATABASES="$(get CF_DATABASES)"
if [[ ! "$PW" =~ ^[0-9a-zA-Z_-]+$ ]]; then
  echo "CF_AUTH_PASSWORD chỉ được chứa chữ, số, '_' hoặc '-'." >&2
  exit 1
fi

# Truyền mật khẩu bằng biến môi trường của exec (không nằm trong dòng lệnh của host).
"${COMPOSE[@]}" exec -T -e CF_AUTH_PASSWORD="$PW" postgres sh -c '
  set -e
  psql -v ON_ERROR_STOP=1 -v pw="$CF_AUTH_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<SQL
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '"'"'cf_auth'"'"')
  THEN '"'"'ALTER ROLE cf_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '"'"' || quote_literal(:'"'"'pw'"'"')
  ELSE '"'"'CREATE ROLE cf_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '"'"' || quote_literal(:'"'"'pw'"'"')
END AS stmt \\gexec
SQL
'

for db in $DATABASES; do
  if [[ ! "$db" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "Tên database không hợp lệ: $db" >&2
    exit 1
  fi
  "${COMPOSE[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 --username \"\$POSTGRES_USER\" --dbname postgres -c 'GRANT CONNECT ON DATABASE \"$db\" TO cf_auth'" < /dev/null
done
echo "Đã đảm bảo role cf_auth (mật khẩu theo $ENV_FILE) và quyền CONNECT vào: $DATABASES."
