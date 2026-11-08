## OPENAI-KEY. Nhập `OPENAI_API_KEY` vào máy ảo và bật LLM thật cho ô Thử AI / EVAL-RUNNER — `PIPE-CLASSIFY-EXTRACT`, `PIPE-DRAFT`, `EVAL-RUNNER`

Chỉ cần khóa OpenAI lúc này; Anthropic/Gemini thêm sau bằng đúng cách này, **không sửa code** (các bí danh `cand-*` trong `infra/litellm/config.yaml` đã có sẵn). Cấu hình đánh giá ban đầu (Q-LLM2): `cf-classify` (extract, rewrite) và `cf-draft` đều = `gpt-5.6-luna` (reasoning `none`). **Lưu ý rủi ro (Q-LLM1):** `gpt-5-nano` tắt hẳn ngày 11/12/2026; chỉ còn là `cand-gpt-nano` để so sánh, không làm model chính thức.

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

### Bước 5. Tên model ở máy code (`.env.local`) và bật bước AI bằng feature flag
Env chỉ còn **địa chỉ dịch vụ, khóa và TÊN MODEL** (không còn cờ `*_LLM_ENABLED`):
```
CLASSIFY_LLM_MODEL=cf-classify
REWRITE_LLM_MODEL=cf-classify
DRAFT_LLM_MODEL=cf-draft
```
`LITELLM_BASE_URL` và `LITELLM_API_KEY` đã có sẵn. Khởi động lại web/worker để nạp tên model.

**Bật từng bước bằng feature flag DB** (mặc định TẮT; `docs/09` §10). Ở dev, bật cho MỘT workspace (thay `<uuid>` bằng id workspace dev, ví dụ Shop Thử 2) hoặc cho tất cả:
```
pnpm flags:set -- cf.ai.classify on --workspace <uuid>
pnpm flags:set -- cf.ai.draft on --workspace <uuid>
pnpm flags:set -- cf.ai.rewrite on --workspace <uuid>
```
(bỏ `--workspace <uuid>` để bật toàn hệ thống). Cờ có hiệu lực trong vài giây, không cần khởi động lại. Bật các cờ này **tốn tiền** (trần là `max_budget` ở Bước 4). Lệnh chỉ chạy trên `cf_dev`/`cf_test`/`cf_ci`; staging/production dùng trang Admin (gap `ADMIN-FLAGS-PAGE`).

### Quay lui
Tắt cờ: `pnpm flags:set -- cf.ai.draft off [--workspace <uuid>]` (và `cf.ai.classify`, `cf.ai.rewrite`) — không gọi LLM nữa. Gỡ khóa: sửa dòng `OPENAI_API_KEY=` trong `.env.cf-dev` trên máy ảo về rỗng rồi `pnpm cf:dev up -d --no-deps litellm`.

### Lưu ý
Mẫu chạy EVAL-RUNNER (`synthetic`) chỉ để thử runner, không dùng để chọn model hay báo đạt Cổng 2 — Cổng 2 cần bộ ~300 bình luận thật (xem mục định dạng bộ mẫu thật).
