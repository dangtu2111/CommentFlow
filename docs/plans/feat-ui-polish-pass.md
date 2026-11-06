# Kế hoạch `feat-ui-polish-pass` — UI-FIDELITY vòng 2 (rà lại toàn bộ màn đã làm)

Mã gap matrix: `UI-FIDELITY-POLISH` (mới) · Mã ảnh `polish` · Thiết kế: `design/stitch/*.png`, `docs/08` §2.

**Tóm tắt:** Chụp lại các màn đã làm (đăng nhập/đăng ký/quên mật khẩu…, 404, khung ứng dụng, Bình luận, Kiến thức/Bài viết, Tự động hóa, Quy tắc spam, Khách tiềm năng) ở 1440px và 390px, tìm điểm lệch/lỗi bố cục còn lại và sửa bằng CSS/token. Không đổi logic nghiệp vụ, không migration, không thêm số liệu bịa. Rủi ro thấp (chỉ CSS + một chuỗi hiển thị trong fixture dev).

## Điểm chưa rõ

Không có (xem QPOL1).

## Tiêu chí nghiệm thu

1. Trang Bình luận ở 390px không tràn ngang (ảnh `polish/sau/comments-390.png` rộng đúng 390px; hai cụm tab cuộn ngang trong khung).
2. Ô nhập không có biểu tượng không còn lề trái thừa; ô có biểu tượng giữ nguyên chỗ cho biểu tượng — so ảnh `automation-1440` trước/sau.
3. Khách tiềm năng (trang mẫu dev) xếp Kanban 4 cột đầy đủ, thẻ chi tiết nằm dưới; chỉ số không bị xuống dòng.
4. Thanh đầu trang auth/404 ở 390px: tên thương hiệu và nút ngôn ngữ không xuống dòng.
5. Tab-focus: `:focus-visible` toàn cục còn hiệu lực (đọc `globals.css`); trạng thái rỗng/lỗi/đang tải không đổi.
6. `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, test web xanh; không số liệu/huy hiệu bịa mới.

## File sẽ đọc / sửa

Đọc: `globals.css`, `auto-leads.css`, `automation-form.tsx`, `dev/ui/comments/page.tsx`, `tokens.css`.
Sửa: `apps/web/src/styles/{globals,auto-leads}.css`, `components/automation/automation-form.tsx` (chữ cái avatar bỏ tiền tố `[MẪU]`), `app/dev/ui/comments/page.tsx` (tổng mẫu khớp số dòng), `docs/plans/ui-fidelity/polish/*`, `docs/plans/quyet-dinh/qpol1.md`, gap-matrix, MASTER.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc; kiểm bằng ảnh Playwright trước/sau và test web hiện có.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web test`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Các điểm "Chưa khớp" cần dữ liệu thật (SLA, độ chính xác AI, KPI, ảnh bài, trang Leads thật…) giữ nguyên trong gap matrix; không bịa. Trang thật cần DB + phiên (onboarding, 403, Kênh) chưa chụp được trên làn này.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: chỉ CSS, quyết định ở QPOL1).
