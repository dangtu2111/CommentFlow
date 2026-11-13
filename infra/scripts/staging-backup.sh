#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO. Sao lưu DB của cf-staging (bản chạy thật cá nhân): pg_dump định dạng custom (-Fc) nén, giữ N bản gần nhất.
# KHÔNG in mật khẩu; pg_dump chạy BÊN TRONG container postgres (không cần cài gì thêm trên máy ảo).
#
# Dùng:   bash infra/scripts/staging-backup.sh [--keep 14] [--dir ~/cf-backups]
# Cron:   0 3 * * *  bash $HOME/CommentFlow/infra/scripts/staging-backup.sh >> $HOME/cf-backups/backup.log 2>&1
# Khôi phục (khi cần, DỪNG web + worker trước):
#   docker exec -i cf-staging-postgres-1 pg_restore -U postgres -d commentflow --clean --if-exists < FILE.dump
# Lưu ý: bản sao lưu CHỈ nằm trên máy ảo; hãy chép định kỳ sang nơi khác (máy bạn / ổ ngoài) — cùng ổ đĩa với DB thì chưa an toàn trước hỏng ổ.
set -euo pipefail
umask 077

KEEP=14
DIR="$HOME/cf-backups"
CONTAINER="${CF_STAGING_POSTGRES_CONTAINER:-cf-staging-postgres-1}"
DB="${CF_APP_DATABASE:-commentflow}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP="${2:-}"; shift 2 ;;
    --dir) DIR="${2:-}"; shift 2 ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Tùy chọn không hợp lệ: $1" >&2; exit 2 ;;
  esac
done
[[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -ge 1 ]] || { echo "--keep phải là số nguyên ≥ 1." >&2; exit 2; }

mkdir -p "$DIR"
chmod 700 "$DIR"
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "Không thấy container $CONTAINER đang chạy." >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DIR/${DB}-${STAMP}.dump"
docker exec "$CONTAINER" pg_dump -U postgres -d "$DB" -Fc >"$FILE.part"
[[ -s "$FILE.part" ]] || { rm -f "$FILE.part"; echo "pg_dump trả về file rỗng." >&2; exit 1; }
mv "$FILE.part" "$FILE"
SIZE="$(du -h "$FILE" | cut -f1)"
echo "$(date -Is) đã sao lưu $DB → $FILE ($SIZE)"

# Giữ $KEEP bản mới nhất.
mapfile -t OLD < <(ls -1t "$DIR"/"${DB}"-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))")
for f in "${OLD[@]:-}"; do
  [[ -n "$f" ]] && rm -f "$f" && echo "đã xóa bản cũ $f"
done
