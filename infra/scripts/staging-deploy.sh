#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO. Triển khai bản chạy thật cá nhân (project Compose `cf-staging`) KHÔNG qua runner GitHub: repo PUBLIC nên không được dùng runner tự host (Q-SOLO2, docs/staging/ban-chay-that-ca-nhan.md).
# Chỉ MỘT người vận hành (chủ dự án) — lớp duyệt của GitHub được thay bằng: chạy trên máy ảo + khóa admin chỉ nằm ở đó + MÃ XÁC NHẬN khi áp migration + sao lưu trước khi deploy.
#
# Dùng:  bash ~/cf-staging/src/infra/scripts/staging-deploy.sh <lệnh> [tùy chọn]
#   init                    lần đầu: chạy Postgres + Valkey và đánh dấu DB (cf.env = 'staging')
#   migrate [--apply]       mặc định chỉ LIỆT KÊ migration chờ (dry-run); --apply áp thật, hỏi mã xác nhận <db>@<số cuối>
#   queue   [--apply]       cài pg-boss + hàng đợi (dry-run mặc định)
#   deploy  [--ref REF] [--apply-migrations]
#                           lấy mã (mặc định origin/main) → build web+worker → sao lưu DB → migration (dry-run; có --apply-migrations thì hỏi rồi áp) → worker lên trước, web sau
#   rollback <sha12>        chạy lại web+worker bằng image đã build của commit cũ (không build; migration KHÔNG tự lùi)
#   status                  trạng thái các dịch vụ + health
# Biến: CF_STAGING_ENV_FILE (mặc định ~/cf-staging/.env.cf-staging), CF_STAGING_SRC (mặc định ~/cf-staging/src, bản clone repo công khai).
# An toàn: KHÔNG in bí mật; chuỗi kết nối admin chỉ đi qua biến môi trường của tiến trình; migrate chỉ chạy với APP_ENV=staging + CF_STAGING_SOLO_OPERATOR=true + đúng tên DB + mã xác nhận.
main() {
  set -euo pipefail
  umask 077

  local ENV_FILE="${CF_STAGING_ENV_FILE:-$HOME/cf-staging/.env.cf-staging}"
  local SRC="${CF_STAGING_SRC:-$HOME/cf-staging/src}"
  local REPO_URL="https://github.com/dangtu2111/CommentFlow.git"
  local PROJECT="cf-staging"
  local PG_CONTAINER="${PROJECT}-postgres-1"
  local DB_NAME="commentflow"
  local TAG=""

  die() { echo "LỖI: $*" >&2; exit 1; }
  usage() { sed -n '2,19p' "$0"; }
  getenvfile() { grep -m1 -E "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }

  [[ $# -ge 1 ]] || { usage; exit 2; }
  local CMD="$1"; shift
  [[ "$CMD" == "-h" || "$CMD" == "--help" ]] && { usage; exit 0; }
  [[ -f "$ENV_FILE" ]] || die "Không thấy $ENV_FILE — chạy infra/scripts/gen-staging-env.sh trước."
  command -v docker >/dev/null || die "Thiếu docker."
  DB_NAME="$(getenvfile CF_APP_DATABASE)"; DB_NAME="${DB_NAME:-commentflow}"

  ensure_src() {
    if [[ ! -d "$SRC/.git" ]]; then
      mkdir -p "$(dirname "$SRC")"
      git clone -q "$REPO_URL" "$SRC"
    fi
  }

  # docker compose của cf-staging (chạy trong thư mục mã nguồn). Thẻ image lấy từ biến TAG (nếu có).
  dc() {
    local profile=()
    if [[ -n "$(getenvfile CLOUDFLARE_TUNNEL_TOKEN)" ]]; then profile=(--profile tunnel); fi
    (cd "$SRC" && IMAGE_TAG="${TAG:-$(getenvfile IMAGE_TAG)}" docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
      -f infra/docker-compose.yml -f infra/docker-compose.staging.yml "${profile[@]}" "$@")
  }

  last_migration() { grep -o '"tag": "[0-9]\{4\}' "$SRC/packages/db/migrations/meta/_journal.json" | tail -1 | grep -o '[0-9]\{4\}$'; }

  # Chạy một CLI staging trong container worker (image chứa mã + tsx). Chuỗi admin chỉ đi qua biến môi trường.
  run_cli() { # $1 = đường dẫn lệnh bên trong container (sh -c), $2 = mã xác nhận (rỗng = dry-run)
    local owner_pw; owner_pw="$(getenvfile CF_OWNER_PASSWORD)"
    [[ -n "$owner_pw" ]] || die "Thiếu CF_OWNER_PASSWORD trong $ENV_FILE"
    DATABASE_ADMIN_URL="postgresql://cf_owner:${owner_pw}@postgres:5432/${DB_NAME}" \
    CF_CONFIRM_STAGING_MIGRATE="${2:-}" \
    dc run --rm --no-deps \
      -e APP_ENV=staging -e CF_STAGING_SOLO_OPERATOR=true \
      -e CF_STAGING_DB_HOSTS=postgres:5432 -e CF_STAGING_DB_NAME="$DB_NAME" \
      -e DATABASE_ADMIN_URL -e CF_CONFIRM_STAGING_MIGRATE \
      worker sh -c "$1"
  }

  migrate_cmd() { echo "cd /app/packages/db && ../../apps/worker/node_modules/.bin/tsx src/cli/migrate-staging.ts $1"; }
  queue_cmd() { echo "cd /app/apps/worker && ./node_modules/.bin/tsx src/cli/queue-install-staging.ts $1"; }

  # Hỏi mã xác nhận <db>@<số cuối> (gõ tay) rồi chạy bản áp thật.
  apply_with_confirmation() { # $1 = tên bước, $2 = hàm sinh lệnh
    local code="${DB_NAME}@$(last_migration)" typed
    echo "Sắp ÁP THẬT: $1 lên DB '$DB_NAME'. Gõ đúng mã xác nhận để tiếp tục: $code"
    read -r -p "> " typed
    [[ "$typed" == "$code" ]] || die "Sai mã xác nhận — dừng, không ghi gì."
    run_cli "$($2 '')" "$code"
  }

  case "$CMD" in
    init)
      ensure_src
      dc up -d --wait postgres valkey
      docker exec "$PG_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qc "ALTER DATABASE ${DB_NAME} SET cf.env = 'staging'"
      echo "Đã chạy Postgres + Valkey của $PROJECT và đánh dấu DB '$DB_NAME' (cf.env = staging)."
      ;;

    migrate | queue)
      ensure_src
      local apply=0
      [[ "${1:-}" == "--apply" ]] && apply=1
      TAG="$(git -C "$SRC" rev-parse --short=12 HEAD)"
      docker image inspect "cf/worker:${TAG}" >/dev/null 2>&1 || dc build worker
      local fn=migrate_cmd; [[ "$CMD" == "queue" ]] && fn=queue_cmd
      if ((apply)); then
        run_cli "$($fn --dry-run)" ""
        apply_with_confirmation "$CMD" "$fn"
      else
        run_cli "$($fn --dry-run)" ""
      fi
      ;;

    deploy)
      ensure_src
      local ref="origin/main" applym=0
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --ref) ref="${2:-}"; shift 2 ;;
          --apply-migrations) applym=1; shift ;;
          *) die "Tùy chọn không hợp lệ: $1" ;;
        esac
      done
      git -C "$SRC" fetch -q origin
      git -C "$SRC" checkout -q --detach "$ref"
      TAG="$(git -C "$SRC" rev-parse --short=12 HEAD)"
      echo "Triển khai commit $TAG ($(git -C "$SRC" log -1 --format=%s | cut -c1-80))"
      dc config --quiet
      dc build web worker
      dc up -d --wait postgres valkey
      bash "$SRC/infra/scripts/staging-backup.sh" --dir "$HOME/cf-backups" || echo "CẢNH BÁO: sao lưu thất bại (lần đầu chưa có dữ liệu thì bình thường)." >&2
      echo "== Migration chờ =="
      run_cli "$(migrate_cmd --dry-run)" ""
      if ((applym)); then
        apply_with_confirmation migrate migrate_cmd
      else
        echo "(Chưa áp migration. Có migration chờ ở trên thì chạy lại với --apply-migrations.)"
      fi
      run_cli "$(queue_cmd --dry-run)" "" >/dev/null || true
      dc up -d --no-build --wait worker
      dc up -d --no-build --wait web
      if [[ -n "$(getenvfile CLOUDFLARE_TUNNEL_TOKEN)" ]]; then dc up -d --no-build cloudflared; fi
      dc ps
      echo "Xong: commit $TAG. Lùi bản: bash $0 rollback <sha12-cũ>"
      ;;

    rollback)
      ensure_src
      TAG="${1:-}"
      [[ "$TAG" =~ ^[0-9a-f]{12}$ ]] || die "rollback cần sha 12 ký tự của commit cũ (xem: docker images cf/web)."
      docker image inspect "cf/web:${TAG}" "cf/worker:${TAG}" >/dev/null 2>&1 || die "Chưa có image cf/web:${TAG} và cf/worker:${TAG} trên máy."
      dc up -d --no-build --wait worker
      dc up -d --no-build --wait web
      dc ps
      echo "Đã chạy lại bằng commit $TAG. Migration KHÔNG bị lùi."
      ;;

    status)
      ensure_src
      dc ps
      ;;

    *) usage; exit 2 ;;
  esac
}

main "$@"
exit $?
