# Kế hoạch `feat/kb-policies-sync-auto` — Đồng bộ Shopify tự phân tách vào từng thẻ, bỏ nút phân tách thủ công

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017. Chủ dự án: "khi nhấn đồng bộ Shopify thì tất cả dữ liệu phải tự chia vào từng mục, không cần phân tách thủ công trong từng trang".

**Tóm tắt (2–3 câu dễ hiểu):** Job đồng bộ Shopify đã đọc mọi chính sách và tự rút giá trị có cấu trúc thành bản nháp (bước này có từ trước nhưng lỗi/kết quả không hiện ở đâu, nên thẻ trông trống). Nay kết quả lần đồng bộ (số chính sách đã nạp, số giá trị nháp đã tự rút, lỗi/bỏ qua) được ghi và hiển thị ngay trên trang Chính sách, có nút "Đồng bộ lại từ Shopify" (Owner) thay cho nút "Phân tách tự động" thủ công đã bỏ. Phần chưa phân tách được vẫn liệt kê (PR #310). Không migration.

## Điểm chưa rõ

Không có. Ghi nhận giới hạn (cần quyết định riêng, không làm ở đây): bộ rút giá trị là quy tắc thuần chỉ nhận câu nêu số/điều kiện rõ ràng; muốn tự phân tách được nhiều loại câu hơn (vd. LLM có kiểm chứng trích nguyên văn) là việc có chi phí và rủi ro riêng.

## Tiêu chí nghiệm thu

1. Job đồng bộ ghi `policyFactsDrafted` (số nháp tự rút, kể cả 0) hoặc `policyFactsSkipped` (bước rút lỗi tạm) vào kết quả đồng bộ; lỗi vẫn không làm hỏng việc nạp — kiểm bằng: `apps/worker/src/jobs/shopify-sync.test.ts`.
2. Trang hiển thị đúng trạng thái: chưa kết nối / chưa đồng bộ / lỗi / không nạp được chính sách (thiếu quyền) / số chính sách đã nạp / số giá trị tự rút / chưa có giá trị rõ ràng / gợi ý đồng bộ lại nếu đồng bộ trước khi có bước tự rút; nút Đồng bộ lại chỉ Owner khi đã kết nối — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`.
3. Server Action Đồng bộ lại: chỉ Owner, chặn bấm đúp/dồn (`uiHeavy`), kết quả `sync_queued/sync_recent/rate_limited/unavailable` — kiểm bằng: `kb/policy-actions.test.ts`.
4. Đã xóa nút/hành động phân tách thủ công và mã chết liên quan; trang chạy bình thường — kiểm bằng: typecheck + toàn bộ test web.
5. Tự kiểm theo `verify.md`: không migration/RLS/trigger; thông tin kết nối Shopify chỉ đọc trạng thái (không secret/token) và chỉ cho Owner — kiểm bằng: đọc diff (nhãn "tự kiểm, chưa có kiểm chứng độc lập").

## File sẽ đọc

`apps/worker/src/jobs/shopify-sync.ts`, `packages/db/src/shopify-store.ts`, `apps/web/src/server/shopify-runtime.ts`.

## File sẽ sửa / tạo

Sửa: `apps/worker/src/jobs/shopify-sync.ts` (+ test), `packages/db/src/shopify-store.ts` (kiểu), `kb/policy-actions.ts` (+ test), `kb/policies/page.tsx`, `lib/kb-policy-notice.ts` (+ test), `components/kb/policy-facts-panel.tsx` (+ test), `packages/shared/src/i18n/messages/{vi,en}.json`. Xóa: `lib/kb-policy-analyze.ts` (+ test).

## Migration

Không (`last_sync_summary` là jsonb đã có).

## Test viết trước

Test viết cùng mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/worker exec vitest run src/jobs/shopify-sync.test.ts`; `pnpm --filter @flow/web exec vitest run "src/app/app/(guarded)/kb/policy-actions.test.ts" src/components/kb`
