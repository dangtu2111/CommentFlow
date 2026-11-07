# Kế hoạch `feat/kb-reembed-ml` — Nối bge-m3 vào kb-reembed + CLI kiểm đếm/đưa job

**Trạng thái duyệt:** Đã duyệt (chủ dự án yêu cầu 07/11/2026: ghi từng lệnh để bật bge-m3, chạy kb-reembed và kiểm số đoạn; "không cần hỏi lại trừ trường hợp đã quy định").

## Việc

Mã gap matrix: `KB-EMBED-LITELLM`, `PGVECTOR-HYBRID` (FR-133) · Spec: `docs/09` §2, `docs/12` §8.

**Tóm tắt:** Để các lệnh bạn chạy thật sự hoạt động, cần bổ sung hai thứ mà kiểm tra phát hiện còn thiếu: worker `kb-reembed` đang cố định dùng embedder mock (nay chọn bge-m3 khi `ML_EMBED_ENABLED=true` + `ML_URL`), và chưa có đường nào đưa job `kb-reembed` vào hàng đợi hay kiểm số đoạn (nay có CLI `kb:reembed -- count|enqueue <workspaceId>`). Kèm hướng dẫn từng lệnh trong `docs/CAN_BAN_CUNG_CAP.md`. Rủi ro: chưa chạy với model thật; không migration.

## Điểm chưa rõ

Không có. (RAM trống của máy ảo — chủ dự án để `<X>` chưa điền — được xử lý bằng bước kiểm RAM kèm quy tắc quyết định ở Bước 0 của hướng dẫn, không đoán số.)

## Tiêu chí nghiệm thu

1. `loadConfig` đọc `ML_EMBED_ENABLED`/`ML_URL`/`ML_API_TOKEN`; `pickReembedEmbedder` chọn bge-m3 khi bật, mock khi không — kiểm bằng: `kb-reembed-embedder.test.ts`.
2. CLI `kb:reembed -- count|enqueue <uuid>` phân tích đối số đúng, báo lỗi có hướng dẫn — kiểm bằng: `kb-reembed-args.test.ts`; chạy thật `count` trên DB dev.
3. `countChunksByEmbeddingModel` đếm theo mô hình, NULL → chuỗi rỗng, không lẫn workspace — kiểm bằng: test tích hợp `kb-reembed.int.test.ts`.
4. `docs/CAN_BAN_CUNG_CAP.md` có mục `KB-EMBED-ML` với từng lệnh (kiểm RAM, pull, bật cờ, dựng `ml`, kiểm `/embed`, bật cờ máy code, count/enqueue/count) — kiểm bằng: `pnpm docs:build`.
5. `pnpm precheck` xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

`apps/worker/src/main.ts`, `config.ts`, `jobs/kb-reembed.ts`, `queue/boss.ts`, `packages/db/src/queries/kb-reembed.ts`, `scripts/lib/cf-dev-command.mjs` (lệnh được phép).

## File sẽ sửa / tạo

`apps/worker/src/{config.ts,main.ts,jobs/kb-reembed-embedder.ts,cli/kb-reembed.ts,cli/kb-reembed-args.ts}` + test, `apps/worker/package.json`, `packages/db/src/queries/kb-reembed.ts`, `docs/can-ban-cung-cap.d/kb-embed-ml.md`.

## Migration

Không có.

## Test viết trước

Chọn embedder theo cấu hình; phân tích đối số CLI; đếm theo mô hình (tích hợp).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/worker exec vitest run` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/kb-reembed.int.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth, RLS, tự gửi, migration; CLI dùng role `cf_worker`, `withJob`).

## Rủi ro / câu hỏi cho chủ dự án

Máy ảo cần ~3 GB RAM trống cho container `ml`; kiểm ở Bước 0 trước khi bật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
