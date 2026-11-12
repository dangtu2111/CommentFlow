# Kế hoạch `feat/kb-distill-ab` — giữ `distill@1` làm hằng số A/B, cờ `--prompt` cho `kb:distill`, đo cổng 80%

## Việc

Chủ dự án (12/11/2026): giữ prompt `distill@1` trong code dạng hằng số A/B; thêm `--prompt distill@1|distill@2` cho `kb:distill`; chạy cả hai trên cùng 20 đoạn (`--force-first 20`), ghi số mục đạt/bị loại theo lý do, chi phí ≤ 0,05 USD; nói rõ `product_attr` biến mất do đâu; cổng v2 ≥ 80% v1 (không tính `product_attr`), thấp hơn thì quay về v1 làm mặc định; xóa nháp do lần đo tạo.

**Tóm tắt (2–3 câu dễ hiểu):** Lệnh chắt lọc chạy tay giờ chọn được bản prompt (cũ/mới) để so cùng điều kiện; bản cũ được giữ nguyên văn. Kết quả đo và quyết định giữ/đổi mặc định ở `docs/testing/eval-kb-distill-v2-2026-11-12.md`. Rủi ro: chỉ lệnh chạy tay dùng cờ mới; luồng tự động vẫn dùng bản mặc định.

## Điểm chưa chốt

Cổng đọc theo chữ (faq + shop_field) đạt 86%, đọc chặt (chỉ FAQ) 79,5% — chủ dự án quyết nếu muốn cổng chặt.

## Tiêu chí nghiệm thu

1. `distill@1` đúng nguyên văn bản cũ (prompt + schema không có `field`), ghi `ai_usage.prompt_version` đúng; mặc định vẫn là bản mới nhất; chuỗi lạ bị từ chối.
2. `acceptedByKind` đếm theo loại; CLI in số theo loại.
3. Báo cáo đo có số đạt/bị loại theo lý do cho từng bản, chi phí ≤ 0,05 USD, kết luận cổng, giải thích `product_attr`.
4. Nháp do lần đo tạo đã xóa (không đụng 103 nháp cũ).

## File sẽ đọc / sửa

Sửa: `packages/ai/src/kb-distill/{distiller,schema,run-distill,index}.ts` (+ test), `apps/worker/src/cli/kb-distill.ts`. Thêm: báo cáo đo (ghi đè bản trước).

## Migration

Không.

## Test viết trước

`kb-distill.test.ts`: "prompt chắt lọc A/B" (3 ca) và "số mục đạt theo loại".

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-distill` · typecheck ai/worker.

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS/migration/cổng tự gửi; chỉ lệnh dev + hằng số prompt).

## Rủi ro / câu hỏi cho chủ dự án

Sản lượng FAQ của v2 thấp hơn v1 ~20% (sát ngưỡng); phương án giữ `shop_field` ở lần gọi riêng chưa làm.
