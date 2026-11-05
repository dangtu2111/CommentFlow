#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO (qua `pnpm cf:dev add-test-db <làn>`). Tạo database test riêng của một làn song song
# (`cf_test_<làn>`, xem docs/workflows/parallel.md) trong Postgres cf-dev ĐÃ khởi tạo. Idempotent:
#  - tạo DB nếu chưa có (chủ sở hữu cf_owner, như cf_test);
#  - thu hồi quyền của PUBLIC, chỉ cấp CONNECT cho cf_app và cf_auth;
#  - bật extension vector, unaccent, pg_trgm, citext.
# Schema và quyền bảng do migration lúc `pnpm test:db` quyết định, KHÔNG phải script này.
# Chỉ project cf-dev. Không đọc/in bí mật (chỉ dùng POSTGRES_USER trong container).
set -euo pipefail

LANE="${1:-}"
if [[ ! "$LANE" =~ ^[a-z0-9]{1,8}$ ]]; then
  echo "Tên làn không hợp lệ (chữ thường/số, tối đa 8 ký tự), ví dụ: a" >&2
  exit 1
fi
DB="cf_test_${LANE}"

ENV_FILE=".env.cf-dev"
COMPOSE=(docker compose -p cf-dev --env-file "$ENV_FILE" -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Không đọc được $ENV_FILE (chạy scripts/cf-dev-env-init.sh trước)." >&2
  exit 1
fi

psql_in() { "${COMPOSE[@]}" exec -T postgres sh -c "$1" < /dev/null; }

# DB đã có chưa? (tên đã kiểm regex nên an toàn khi ghép vào câu lệnh)
exists="$(psql_in "psql --username \"\$POSTGRES_USER\" --dbname postgres -tAc \"SELECT 1 FROM pg_database WHERE datname = '$DB'\"" | tr -d '[:space:]')"
if [[ "$exists" != "1" ]]; then
  psql_in "psql -v ON_ERROR_STOP=1 --username \"\$POSTGRES_USER\" --dbname postgres -c 'CREATE DATABASE \"$DB\" OWNER cf_owner'"
  echo "Đã tạo database $DB."
else
  echo "Database $DB đã có; đảm bảo lại quyền và extension."
fi

"${COMPOSE[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 --username \"\$POSTGRES_USER\" --dbname \"$DB\"" <<SQL
REVOKE ALL ON DATABASE "$DB" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$DB" TO cf_app, cf_auth;
-- cf_worker (migration 0030): cấp CONNECT nếu role đã có (máy ảo cũ chưa chạy add-worker-role thì bỏ qua; add-worker-role cấp bù).
DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cf_worker') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO cf_worker', current_database());
  END IF;
END \$\$;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
echo "Đã đảm bảo $DB: CONNECT cho cf_app/cf_auth, extension vector/unaccent/pg_trgm/citext."
