#!/bin/bash
# Chạy MỘT lần khi volume Postgres còn trống (cơ chế docker-entrypoint-initdb.d).
# Mật khẩu lấy từ biến môi trường của container (sinh bằng scripts/cf-dev-env-init.sh);
# toàn bộ là chuỗi hex nên an toàn khi đặt trong câu SQL.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE cf_owner LOGIN PASSWORD '${CF_OWNER_PASSWORD}';
CREATE ROLE cf_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${CF_APP_PASSWORD}';
CREATE ROLE litellm LOGIN PASSWORD '${LITELLM_DB_PASSWORD}';
CREATE ROLE langfuse LOGIN PASSWORD '${LANGFUSE_DB_PASSWORD}';
CREATE DATABASE litellm OWNER litellm;
CREATE DATABASE langfuse OWNER langfuse;
SQL

# CF_DATABASES: danh sách DB ứng dụng (dev: "cf_dev cf_test"; staging: "commentflow").
for db in ${CF_DATABASES}; do
  if [[ ! "$db" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "Tên database không hợp lệ: $db" >&2
    exit 1
  fi
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE \"$db\" OWNER cf_owner"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
REVOKE ALL ON DATABASE "$db" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$db" TO cf_app;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
done
