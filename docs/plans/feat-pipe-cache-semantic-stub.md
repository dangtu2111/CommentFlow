# Kế hoạch `feat-pipe-cache-semantic-stub` — Semantic cache LiteLLM (cấu hình tối thiểu)

## Việc

Mã gap matrix: `PIPE-CACHE-SEMANTIC-STUB` · Spec: FR-026 (docs/05), docs/09 §4 `cacheLookup`.

**Tóm tắt:** Chuẩn bị sẵn "khung" cho bộ nhớ đệm theo ý nghĩa (semantic cache: câu hỏi diễn đạt khác nhưng cùng nghĩa dùng lại câu trả lời cũ) của LiteLLM nhưng để TẮT: một file cấu hình mẫu và một hàm nhỏ dựng tham số `cache` cho từng lần gọi, bảo đảm tên vùng cache luôn chứa `workspace_id` và `kb_version` (không lẫn giữa các shop). Phần đầy đủ làm ở GĐ5. Rủi ro thấp: không nối pipeline, không gọi dịch vụ thật, không migration.

## Điểm chưa rõ

Không có (xem Q-PCS1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Cờ tắt (mặc định) → tham số gọi là `no-cache` + `no-store` — kiểm bằng `semantic-cache.test.ts`.
2. Cờ bật → `namespace` = `cf:{workspace_id}:cache:semantic:{kb_version}` + TTL; hai workspace / hai `kb_version` không chung namespace — test.
3. `workspace_id` không phải uuid / `kb_version` không hợp lệ → lỗi `VALIDATION_FAILED` (kể cả khi tắt) — test.
4. Cờ môi trường chỉ đúng chữ `true` mới bật — test.
5. File mẫu `infra/litellm/semantic-cache.example.yaml` không bị `config.yaml` nạp; `env.example` chỉ có tên biến — xem diff.
6. Coverage `@flow/ai` giữ ngưỡng — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/09` §4 (đã đọc qua grep), `infra/litellm/config.yaml`, `packages/ai/src/cache/exact-cache.ts` (kiểu khóa), `packages/ai/src/llm-client.ts` (cách gọi), `env.example`.

## File sẽ sửa / tạo

- tạo `packages/ai/src/cache/semantic-cache.ts` (+ `.test.ts`); sửa `packages/ai/src/index.ts` (export)
- tạo `infra/litellm/semantic-cache.example.yaml`; sửa `env.example`
- sửa `docs/CAN_BAN_CUNG_CAP.md` (§2s), `docs/testing/KIEM_TRA_TAY.md` (KT-PCS), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `QUYET_DINH_CHO_DUYET.md`; tạo handoff.

## Migration

Không có (cờ đọc từ môi trường; không bảng mới).

## Test viết trước

`packages/ai/src/cache/semantic-cache.test.ts` (viết trước khi có `semantic-cache.ts`).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/cache`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/gửi/PII/migration; chỉ cấu hình + hàm thuần). Namespace theo workspace đã có test.

## Rủi ro / câu hỏi cho chủ dự án

Khi bật ở GĐ5 phải loại câu có số tiền và so `product_revs` (semantic match có thể trả giá cũ) — ghi ở `SEMANTIC-CACHE`.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa rõ
- [x] Tiêu chí nghiệm thu kiểm được
- [x] Test viết trước đã nêu
- [x] Đã nêu có/không cần kiểm chứng độc lập

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/ADR hoặc Q-PCS1)
