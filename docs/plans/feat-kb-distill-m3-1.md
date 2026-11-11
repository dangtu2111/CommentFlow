# Kế hoạch `feat/kb-distill-m3-1` — M3-1: FAQ chỉ đọc bản đã duyệt, ghi `fact_topic`, đóng gap theo chủ đề mịn

## Việc

Mã gap matrix: `KB-DISTILL` · ADR 018, lệnh tổng 10/11/2026 (M3, chồng lên PR migration #316). Kế hoạch tổng: `docs/plans/feat-kb-distill.md`.

**Tóm tắt (2–3 câu dễ hiểu):** Ba việc nhỏ chuẩn bị cho bước chắt lọc: (a) mọi chỗ đọc FAQ chỉ lấy mục `published` để nháp chắt lọc sau này không lọt vào AI trước khi Owner duyệt; (b) khi AI ghi "dữ liệu còn thiếu", ghi thêm chủ đề mịn của sự kiện (vd. `warranty`) — nếu một dòng gộp nhiều chủ đề thì để trống; (c) khi Owner duyệt thẻ chính sách, chỉ đóng các dòng có chủ đề mịn đúng, thay cách đóng thô của M2b (nên thẻ bảo hành/thanh toán/COD nay tự đóng được khi khớp). Rủi ro thấp: không đổi quyết định trả lời; gap cũ chưa có chủ đề mịn sẽ không tự đóng (vẫn có huy hiệu "Có thẻ mới").

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Danh sách FAQ, đếm tổng quan, độ sẵn sàng và văn bản cho AI thử bỏ qua `faq_items.status='draft'` — kiểm bằng `packages/db/tests/kb-faq-published-only.int.test.ts`.
2. `toGapInputs` ghi `factTopic` = mã khi đúng một sự kiện cùng chủ đề, null khi gộp/không có mã; `recordKbGap` giữ mã nếu trùng, đặt NULL khi khác — kiểm bằng `persist-records.test.ts`, `retrieval-log.int.test.ts`.
3. Duyệt thẻ đóng gap có `fact_topic` khớp (ship_region→ship_fee/ship_time/ship_destination, cod, returns, warranty, payment); gap NULL/khác chủ đề/workspace khác không đóng — kiểm bằng `packages/db/tests/policy-facts.int.test.ts`.

## File sẽ đọc / sửa

Sửa: `packages/db/src/queries/{kb-content,readiness,try-products,policy-facts}.ts`, `retrieval-logs.ts`, `runtime.ts`, `packages/shared/src/retrieval-log.ts`, `packages/ai/src/fact-plan/types.ts`, `pipeline/{run-pipeline,persist-records}.ts`, `apps/web/.../kb/policy-actions.ts`, test tương ứng, docs.

## Migration

Không (dùng cột của 0084 ở #316). PR chỉ merge khi gốc đã là `main`.

## Test viết trước

Có (test đỏ trước khi đổi code đường đọc/ghi).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db` (các file nêu trên) · `pnpm --filter @flow/ai exec vitest run src/pipeline`.

## Cần kiểm chứng độc lập không?

Không chạm cổng tự gửi/guard/RLS; trigger đã nằm ở #316.

## Rủi ro / câu hỏi cho chủ dự án

Gap cũ (NULL) không tự đóng nữa kể cả shipping — thay bằng huy hiệu và nút Thử lại.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
