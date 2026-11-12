# Kế hoạch `feat/kb-faq-ui` — dựng giao diện FAQ, Câu hỏi chưa trả lời, Nhập sản phẩm

## Việc

Mã gap matrix: `KB-SHOP-V2` / UI KB (Phần 4a). Yêu cầu chủ dự án 11/11/2026: dựng giao diện cho trang nhập sản phẩm, câu hỏi chưa trả lời và Hỏi – đáp (FAQ).

**Tóm tắt (2–3 câu dễ hiểu):** FAQ dựng lại theo `design/stitch/kb-faq.html` (thanh số liệu, tìm kiếm + lọc theo thẻ, thẻ từng cặp hỏi–đáp) bằng dữ liệu thật; trang Câu hỏi chưa trả lời và trang Nhập sản phẩm trước đây dùng CSS cũ nay đổi sang Tailwind cùng ngôn ngữ thiết kế KB (hai trang này chưa có màn Stitch riêng). Không migration; chức năng lưu/sửa/xóa/nhập giữ nguyên. Phần thiết kế chưa có nền tảng (biến thể câu hỏi, lượt trích dẫn, đồng bộ web, nhập Excel trong FAQ, AI sinh biến thể, sandbox) hiện là nút/khối tắt kèm chú thích, không số mẫu.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. FAQ: có thanh số liệu thật (số câu đã duyệt, số gợi ý chờ duyệt dẫn tới tab "Chờ duyệt"), tìm kiếm và chip thẻ (GET), thẻ từng cặp; form thêm/sửa/xóa y như cũ (E2E `kb-content` xanh).
2. Câu hỏi chưa trả lời và Nhập sản phẩm dùng Tailwind trong `.tw`, không tràn ngang ở 1440/390.
3. typecheck, `lint:i18n`, test web xanh.

## File sẽ đọc / sửa

Thêm `apps/web/src/components/kb/faq-ui.tsx`. Sửa: `kb/faq/page.tsx`, `kb-gaps/page.tsx`, `products/import/page.tsx`, `components/kb-gaps/{kb-gap-row,draft-faq-row}.tsx`, `components/products/import-wizard.tsx` (chỉ đổi class), i18n `vi/en`, `docs/plans/ui-thieu-thiet-ke.md`.

## Migration

Không.

## Test viết trước

Không áp dụng (trình bày; hành vi lưu giữ nguyên, đã có E2E).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n && pnpm --filter @flow/web test`; E2E `kb-content` ở CI.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Ảnh "trước" của ba trang không chụp (đổi theo yêu cầu trực tiếp); ảnh sau ở `docs/plans/ui-fidelity/{kb-faq,kb-import,kb-gaps}/`. `kb-faq` chưa chạy `ui:fidelity` hình học trong PR này (khung KB đã đo ở #328).
