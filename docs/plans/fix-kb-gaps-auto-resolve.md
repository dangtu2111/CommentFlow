# Kế hoạch `fix/kb-gaps-auto-resolve` — Siết tự đóng gap khi duyệt thẻ (M2b)

## Việc

Mã gap matrix: `KB-GAPS-FROM-HANDOFF` (sửa) · lệnh tổng 10/11/2026, M2b.

**Tóm tắt (2–3 câu dễ hiểu):** Bản M2 đóng mọi gap "chính sách" khi duyệt bất kỳ thẻ chính sách nào, nên duyệt thẻ Thanh toán cũng đóng nhầm câu hỏi về Bảo hành. Nay chỉ đóng khi khớp chính xác (thẻ Ship ↔ gap shipping; thẻ Đổi trả ↔ gap có câu hỏi đổi trả); gap còn lại hiện huy hiệu "Có thẻ mới, bấm Thử lại". Rủi ro thấp, không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Duyệt `payment` hoặc `returns` không đóng gap bảo hành; duyệt `returns` đóng gap hỏi đổi trả; `payment` không đóng — kiểm bằng: `packages/db/tests/policy-facts.int.test.ts` (DB thật).
2. Duyệt `ship_region` vẫn đóng gap shipping, không đụng gap policy — cùng file.
3. Action truyền bộ so khớp đổi trả dùng `classifyTopic` — kiểm bằng: `policy-actions.test.ts`.
4. Huy hiệu "Có thẻ mới" đúng theo `updatedAt` thẻ so với `lastSeenAt` gap — kiểm bằng: `lib/kb-gaps-links.test.ts`.

## File sẽ đọc / sửa

`policy-facts.ts`, `retrieval-logs.ts`, `runtime.ts`, `policy-actions.ts`(+test), `kb-gaps.ts`, trang/hàng kb-gaps, `kb-gaps-links.ts`(+test), i18n, docs liên quan.

## Migration

Không.

## Test viết trước

Có (int test M2b, `hasNewCard`).

## Lệnh test phạm vi hẹp

`cd packages/db && pnpm test:db`; `cd apps/web && npx vitest run src/lib/kb-gaps-links.test.ts "src/app/app/(guarded)/kb/policy-actions.test.ts"`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Đóng chính xác theo chủ đề mịn của thẻ cần cột `kb_gaps.fact_topic` → M3 giai đoạn 2.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
