# Kế hoạch `feat/inbox-label-filter` — INBOX-LABEL-FILTER: lọc nhãn AI và ưu tiên Mua hàng/Khiếu nại

## Việc

Mã gap matrix: INBOX-LABEL-FILTER (Phần 4e, thứ tự chủ dự án 12/11/2026), UF-3.

**Tóm tắt (2–3 câu dễ hiểu):** Trang Bình luận thêm bộ lọc theo nhãn AI (Hỏi giá, Tư vấn, Mua hàng, Khiếu nại, Spam, Khác) trong ô lọc nâng cao, và tab "Chờ duyệt" đưa các bình luận Mua hàng/Khiếu nại lên đầu để nhân viên xử lý trước. Trong mỗi nhóm vẫn theo thứ tự cũ nhất/mới nhất đang chọn. Không migration; chỉ đọc.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. `?label=` chỉ nhận 6 nhãn chuẩn (giá trị lạ bỏ qua); lọc áp cho cả danh sách lẫn số tab.
2. Tab Chờ duyệt: Mua hàng/Khiếu nại lên đầu, trong nhóm theo `sort`; phân trang con trỏ qua ranh giới nhóm không lặp/sót ở cả hai chiều; con trỏ cũ (không có nhóm) vẫn dùng được.
3. Các tab khác và bình luận chưa gán nhãn không đổi hành vi.
4. typecheck, lint:i18n, biome, test web/db xanh.

## File sẽ đọc / sửa

Sửa: `packages/db/src/queries/inbox.ts`, `apps/web/src/lib/inbox-filters.ts`, `apps/web/src/server/inbox.ts`, `components/comments/inbox-toolbar.tsx`, i18n `vi/en`, `docs/gap-matrix.md`. Test: `packages/db/tests/inbox.int.test.ts`, `apps/web/src/lib/inbox-filters.test.ts`.

## Migration

Không.

## Test viết trước

`inbox.int.test.ts` (5 ca), `inbox-filters.test.ts` (3 ca).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db tests/inbox.int.test.ts` · `pnpm --filter @flow/web test`.

## Cần kiểm chứng độc lập không?

Không: chỉ đọc, không đụng auth/RLS/migration/cổng tự gửi; dùng `withActor` + RLS có sẵn.

## Rủi ro / câu hỏi cho chủ dự án

Ưu tiên chỉ áp ở tab Chờ duyệt (đúng UF-3); bình luận chưa có nhãn (chưa phân loại) xếp vào nhóm thường.
