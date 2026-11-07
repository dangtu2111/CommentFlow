## OPENAI-KEY. Nhập `OPENAI_API_KEY` vào máy ảo và bật LLM thật cho ô Thử AI / EVAL-RUNNER — `PIPE-CLASSIFY-EXTRACT`, `PIPE-DRAFT`, `EVAL-RUNNER`

Chỉ cần khóa OpenAI lúc này; Anthropic/Gemini thêm sau bằng đúng cách này, **không sửa code** (các bí danh `cand-*` trong `infra/litellm/config.yaml` đã có sẵn). Cấu hình đánh giá ban đầu (Q-LLM2): `cf-classify` (extract, rewrite) = `gpt-5-nano`; `cf-draft` = `gpt-5.6-luna`. **Lưu ý rủi ro (Q-LLM1):** `gpt-5-nano` tắt hẳn ngày 11/12/2026; chỉ dùng để so sánh, không làm model chính thức.

Khóa nằm trên **máy ảo** (`.env.cf-dev`), nhập bằng script ẨN: khóa không hiện trên màn hình, không vào lịch sử shell, không dán vào chat. Lệnh `pnpm …` chạy ở máy code; lệnh `ssh cf …` chạy trên máy ảo.

### Bước 1. Lấy cấu hình LiteLLM mới về máy ảo
Sau khi PR EVAL-RUNNER (có bí danh `cf-classify`, `cf-draft`) đã merge vào `main`:
```
pnpm cf:dev sync main
```

### Bước 2. Nhập khóa (ẩn)
```
ssh -t cf "cd ~/CommentFlow && bash infra/scripts/cf-dev-set-llm-key.sh"
```
Script hỏi lần lượt ba khóa. Với lần này: **Enter** ở `ANTHROPIC_API_KEY`, **dán khóa OpenAI** ở `OPENAI_API_KEY` rồi Enter, **Enter** ở `GEMINI_API_KEY`. Script ghi vào `~/CommentFlow/.env.cf-dev` (quyền 600) rồi tạo lại **chỉ** container `litellm` (`up -d --no-deps litellm`, không đụng `postgres`).

### Bước 3. Kiểm (chỉ đọc, không in khóa)
Khóa đã vào container LiteLLM (phải ra `OPENAI_API_KEY có giá trị`):
```
ssh cf "docker exec cf-dev-litellm-1 sh -c 'test -n \"\$OPENAI_API_KEY\" && echo OPENAI_API_KEY có giá trị || echo OPENAI_API_KEY RỖNG'"
```
Cấu hình có đủ hai bí danh mới (phải ra `2`):
```
ssh cf "docker exec cf-dev-litellm-1 grep -c 'model_name: cf-' /app/config.yaml"
```
Container khỏe: `pnpm cf:dev ps` (dòng `litellm` ghi `healthy`).

### Bước 4. Khóa ảo của app phải cho phép hai bí danh mới
Mở `http://<ip-máy-ảo>:4000/ui` → Keys. Khóa ảo đang dùng làm `LITELLM_API_KEY` ở máy code phải cho phép các model `cf-classify`, `cf-draft` (nếu được tạo khi chỉ có `mock-llm` thì chưa cho phép). Đặt **Max Budget** theo tháng làm trần chi phí.

### Bước 5. Biến môi trường ở máy code (`.env.local`)
Bật từng bước (tên biến có trong `env.example`; chỉ đúng chữ `true` mới bật):
```
CLASSIFY_LLM_ENABLED=true
CLASSIFY_LLM_MODEL=cf-classify
REWRITE_LLM_ENABLED=true
REWRITE_LLM_MODEL=cf-classify
DRAFT_LLM_ENABLED=true
DRAFT_LLM_MODEL=cf-draft
```
`LITELLM_BASE_URL` và `LITELLM_API_KEY` đã có sẵn. Bật các cờ này **tốn tiền** (trần là `max_budget` ở Bước 4). Khởi động lại web/worker để nạp biến.

### Quay lui
Đặt các cờ `*_LLM_ENABLED` về rỗng hoặc xóa dòng ở `.env.local` (không gọi LLM nữa). Gỡ khóa: sửa dòng `OPENAI_API_KEY=` trong `.env.cf-dev` trên máy ảo về rỗng rồi `pnpm cf:dev up -d --no-deps litellm`.

### Lưu ý
Mẫu chạy EVAL-RUNNER (`synthetic`) chỉ để thử runner, không dùng để chọn model hay báo đạt Cổng 2 — Cổng 2 cần bộ ~300 bình luận thật (xem mục định dạng bộ mẫu thật).
