# Kế hoạch `fix/kb-frame-stitch` — khung KB dùng chung theo HTML kb-overview

## Việc

Mã gap matrix: `KB-SHOP-V2` / UI KB. Lệnh chủ dự án 11/11/2026: sửa khung KB MỘT lần cho cả 10 màn, theo `design/stitch/kb-overview.html`; không đụng khung ứng dụng.

**Tóm tắt (2–3 câu dễ hiểu):** Đối chiếu khung KB (`KbFrame`/`KbFrameView`: thanh lệnh, thanh độ đầy đủ, rail trái) với `kb-overview.html` bằng `pnpm ui:fidelity`: khung đã khớp hình học (đã dựng từ thiết kế cùng bố cục); chỗ còn thiếu là huy hiệu phiên bản và dòng "Bản nháp — N thay đổi chưa xuất bản" — nay lấy từ dữ liệu THẬT (`kbPublish().overview`) ở trang Nguồn dữ liệu. Thêm mốc `data-landmark="primary-button"` cho nút Xuất bản để công cụ đo so đúng nút. Rủi ro thấp: chỉ hiển thị.

## Điểm chưa chốt

Không có. Việc tải lại `kb-overview.html` bằng MCP "ghi thẳng ra đĩa" không làm được: công cụ chỉ lưu file khi kết quả vượt giới hạn, kết quả của màn này nhỏ hơn nên trả thẳng vào hội thoại; giữ bản đã chép (khác biệt chỉ có thể nằm ở hai đường dẫn ảnh minh họa, không ảnh hưởng đo).

## Tiêu chí nghiệm thu

1. `/app/kb` hiện huy hiệu "Đã xuất bản vN" (hoặc "Chưa xuất bản") và dòng nháp thật; lỗi đọc → bỏ huy hiệu, trang không hỏng.
2. `ui:fidelity kb-overview //app/kb`: hình học chỉ còn lệch khung ứng dụng + mốc "card" + rộng nút (ghi ở `q-kb-ui-fidelity.md`). Đo lại `kb-shop` sau sửa.
3. typecheck, `lint:i18n`, test web xanh.

## File sẽ đọc / sửa

Sửa: `apps/web/src/components/kb/{kb-frame,kb-frame-view}.tsx`, `apps/web/src/app/app/(guarded)/kb/page.tsx`, i18n `vi/en`. Thêm: `docs/plans/quyet-dinh/q-kb-ui-fidelity.md`.

## Migration

Không.

## Test viết trước

Không áp dụng (trình bày thuần, dữ liệu có sẵn).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n && pnpm --filter @flow/web test`; `pnpm ui:fidelity kb-overview //app/kb --base http://localhost:3000`.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

`/app/kb` thêm một lần gọi `kbPublish().overview` (đã dùng ở trang Xuất bản); lỗi được bỏ qua.
