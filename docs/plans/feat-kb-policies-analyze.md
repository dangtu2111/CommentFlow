# Kế hoạch `feat/kb-policies-analyze` — Nối dữ liệu thô với giá trị AI đã phân tách trên trang Chính sách

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017. Hiện việc rút giá trị có cấu trúc từ văn bản chỉ chạy trong job đồng bộ Shopify (worker); trang không có cách thấy "dữ liệu thô" và không chạy lại được.

**Tóm tắt (2–3 câu dễ hiểu):** Trang Chính sách thêm khối "Từ dữ liệu thô sang giá trị có cấu trúc": cho biết có bao nhiêu văn bản chính sách thô đã nạp (ví dụ từ Shopify) và nút "Phân tách tự động" (Owner) chạy bộ rút giá trị (quy tắc thuần, không LLM) trên chính các văn bản đó. Kết quả là các bản NHÁP kèm nguyên văn câu gốc làm bằng chứng, hiện ngay ở bốn thẻ bên dưới để Owner duyệt. Không đụng bản đã duyệt hay nháp Owner đã sửa tay; không migration.

## Điểm chưa rõ

Không có. Quyết định: dùng đúng bộ `suggestPolicyFacts` của worker (một nguồn quy tắc); nguồn nháp là `text_suggested` (khác `shopify_suggested` của job đồng bộ nên hai nguồn không xóa nháp của nhau).

## Tiêu chí nghiệm thu

1. `analyzePolicyTexts`: không văn bản/rỗng → 0; nhiều văn bản gộp, rút giá trị kèm nguyên văn câu làm bằng chứng; câu mơ hồ không bịa; cắt ở trần độ dài — kiểm bằng: `lib/kb-policy-analyze.test.ts`.
2. `analyzePolicyTextAction`: chỉ Owner; có văn bản thô → làm mới nháp `text_suggested` và báo số nháp (`?pn=analyzed&pc=N`); không có → `no_raw`; chống bấm đúp; lỗi bất ngờ → `unavailable` — kiểm bằng: `kb/policy-actions.test.ts`.
3. Owner chạy làm mới qua `withActor` (không cần worker): tạo nháp, chạy lại không tăng `rev`, hết đề xuất thì xóa; Staff bị RLS chặn — kiểm bằng: `packages/db/tests/policy-facts.int.test.ts`.
4. Panel: khối dữ liệu thô hiện số văn bản (Owner), nút hoạt động khi có văn bản và khóa khi chưa có, Staff không có nút, thông báo `analyzed` kèm số — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`.
5. Tự kiểm theo `docs/workflows/verify.md`: không migration/RLS/trigger; ghi chỉ là NHÁP qua hàm DB đã kiểm Zod; chỉ Owner; không log nội dung — kiểm bằng: đọc diff (nhãn "tự kiểm, chưa có kiểm chứng độc lập").

## File sẽ đọc

`apps/worker/src/jobs/shopify-sync.ts` (cách worker gọi), `packages/ai/src/fact-plan/suggest.ts`, `packages/db/src/queries/{policy-facts,kb-content}.ts`.

## File sẽ sửa / tạo

Tạo: `apps/web/src/lib/kb-policy-analyze.ts` (+ test). Sửa: `kb/policy-actions.ts` (+ test), `kb/policies/page.tsx`, `lib/kb-policy-notice.ts` (+ test), `components/kb/policy-facts-panel.tsx` (+ test), `packages/db/tests/policy-facts.int.test.ts`, `packages/shared/src/i18n/messages/{vi,en}.json`, `docs/gap-matrix.md`.

## Migration

Không.

## Test viết trước

Test viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/kb-policy-analyze.test.ts "src/app/app/(guarded)/kb/policy-actions.test.ts" src/components/kb`; `cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/policy-facts.int.test.ts`
