#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO (qua `pnpm cf:dev add-worker-role`). Thêm role `cf_worker` vào Postgres cf-dev ĐÃ khởi tạo
# (script khởi tạo 10-roles-and-databases.sh chỉ chạy khi volume trống). Idempotent:
#  - sinh CF_WORKER_PASSWORD vào ~/CommentFlow/.env.cf-dev nếu chưa có (không in ra);
#  - tạo role nếu chưa có, hoặc đặt lại mật khẩu cho khớp .env.cf-dev;
#  - GRANT cf_app TO cf_worker (cf_worker kế thừa quyền cf_app; chiều ngược lại KHÔNG được có);
#  - cấp CONNECT vào các database ứng dụng trong CF_DATABASES (kể cả cf_test_<làn> đã tạo).
# Quyền hệ thống/đọc token của cf_worker do migration 0030 quyết định (ADR 011), KHÔNG phải script này.
# PHẢI chạy TRƯỚC `pnpm db:migrate` bản có migration 0030. Chỉ project cf-dev. Không in bí mật.
set -euo pipefail

ENV_FILE=".env.cf-dev"
COMPOSE=(docker compose -p cf-dev --env-file "$ENV_FILE" -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Không đọc được $ENV_FILE (chạy scripts/cf-dev-env-init.sh trước)." >&2
  exit 1
fi

get() { grep -m1 -E "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true; }

if [[ -z "$(get CF_WORKER_PASSWORD)" ]]; then
  umask 077
  [[ -s "$ENV_FILE" && -n "$(tail -c1 "$ENV_FILE")" ]] && echo >> "$ENV_FILE"
  printf 'CF_WORKER_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> "$ENV_FILE"
  echo "Đã thêm CF_WORKER_PASSWORD vào $ENV_FILE (không in giá trị)."
fi
PW="$(get CF_WORKER_PASSWORD)"
DATABASES="$(get CF_DATABASES)"
if [[ ! "$PW" =~ ^[0-9a-zA-Z_-]+$ ]]; then
  echo "CF_WORKER_PASSWORD chỉ được chứa chữ, số, '_' hoặc '-'." >&2
  exit 1
fi

# Mật khẩu đi qua biến môi trường (export + `-e TÊN` không kèm giá trị) và heredoc — KHÔNG nằm trong argv
# của docker/psql (xem được bằng `ps`). Giá trị đã được kiểm regex hex ở trên nên an toàn khi ghép vào SQL.
export CF_WORKER_PASSWORD="$PW"
"${COMPOSE[@]}" exec -T -e CF_WORKER_PASSWORD postgres sh -c '
  set -e
  if psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '"'"'cf_worker'"'"'" | grep -q 1; then verb=ALTER; else verb=CREATE; fi
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
$verb ROLE cf_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '"'"'$CF_WORKER_PASSWORD'"'"';
GRANT cf_app TO cf_worker;
SQL
'

for db in $DATABASES; do
  if [[ ! "$db" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "Tên database không hợp lệ: $db" >&2
    exit 1
  fi
  "${COMPOSE[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 --username \"\$POSTGRES_USER\" --dbname postgres -c 'GRANT CONNECT ON DATABASE \"$db\" TO cf_worker'" < /dev/null
done

# DB test của các làn (cf_test_<làn>) tạo bằng add-test-db không nằm trong CF_DATABASES: cấp CONNECT cho mọi cf_test_*.
"${COMPOSE[@]}" exec -T postgres sh -c '
  for db in $(psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT datname FROM pg_database WHERE datname ~ '"'"'^cf_test_[a-z0-9]+$'"'"'"); do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "GRANT CONNECT ON DATABASE \"$db\" TO cf_worker"
  done
' < /dev/null
echo "Đã đảm bảo role cf_worker (mật khẩu theo $ENV_FILE, thành viên cf_app) và quyền CONNECT vào: $DATABASES và cf_test_<làn>."
