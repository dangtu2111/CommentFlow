#!/usr/bin/env bash
# CHẠY TRÊN MÁY ẢO, CẦN TERMINAL (để nhập khóa ẩn):  ssh -t cf "cd ~/CommentFlow && bash infra/scripts/cf-dev-set-llm-key.sh"
# Hỏi từng khóa nhà cung cấp LLM (Anthropic, OpenAI, Gemini) bằng chế độ ẨN, ghi vào ~/CommentFlow/.env.cf-dev (chmod 600)
# rồi khởi động lại LiteLLM để nạp khóa + cấu hình ứng viên `cand-*` (spec 12 §8). Để trống một nhà cung cấp = giữ nguyên.
# KHÔNG in khóa, KHÔNG đưa khóa vào tham số dòng lệnh (xem được bằng `ps`): khóa đi qua biến môi trường. Chỉ project cf-dev.
set -euo pipefail

ENV_FILE=".env.cf-dev"
COMPOSE=(docker compose -p cf-dev --env-file "$ENV_FILE" -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)
PROVIDERS=(ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY)

if [[ ! -t 0 ]]; then
  echo "Cần chạy trong terminal (ssh -t) để nhập khóa ẩn." >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Không đọc được $ENV_FILE (chạy 'pnpm cf:dev env-init' trước)." >&2
  exit 1
fi

umask 077
changed=0
for name in "${PROVIDERS[@]}"; do
  read -rsp "Nhập $name (Enter để bỏ qua): " value
  echo
  [[ -z "$value" ]] && continue
  if [[ ! "$value" =~ ^[A-Za-z0-9_.-]{8,300}$ ]]; then
    echo "Giá trị $name chứa ký tự lạ hoặc quá ngắn — bỏ qua (khóa thường chỉ gồm chữ, số, '_', '-', '.')." >&2
    continue
  fi
  [[ -s "$ENV_FILE" && -n "$(tail -c1 "$ENV_FILE")" ]] && echo >> "$ENV_FILE"
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  # Giữ mọi dòng khác, thay dòng cũ của khóa này (nếu có), thêm cuối nếu chưa có. Khóa qua ENVIRON, không qua argv.
  NAME="$name" VALUE="$value" awk '
    BEGIN { n = ENVIRON["NAME"]; v = ENVIRON["VALUE"]; done = 0 }
    index($0, n "=") == 1 { if (!done) { print n "=" v; done = 1 } ; next }
    { print }
    END { if (!done) print n "=" v }
  ' "$ENV_FILE" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  unset value
  echo "Đã ghi $name vào $ENV_FILE (không in giá trị)."
  changed=1
done
chmod 600 "$ENV_FILE"

if [[ "$changed" -eq 0 ]]; then
  echo "Không có khóa nào được nhập — không đổi gì."
  exit 0
fi

echo "Khởi động lại LiteLLM để nạp khóa và cấu hình mới..."
# --no-deps: không tạo lại postgres/valkey chỉ vì cấu hình của chúng lệch (docs/workflows/may-ao-dong-bo.md).
"${COMPOSE[@]}" up -d --no-deps litellm
"${COMPOSE[@]}" ps litellm
echo "Xong. Bước tiếp: tạo khóa ảo có max_budget trong giao diện LiteLLM (http://<ip-máy-ảo>:4000/ui) và điền LITELLM_API_KEY vào .env ở máy code."
