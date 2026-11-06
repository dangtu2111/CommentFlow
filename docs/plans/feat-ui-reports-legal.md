# Kế hoạch `feat-ui-reports-legal` — UI-FIDELITY nhóm 7 (Báo cáo, Landing/Bảng giá, Quyền riêng tư, Điều khoản)

Mã gap matrix: `UI-FIDELITY-REPORTS-LEGAL` (mới) · Mã ảnh `ui-reports-legal` · Thiết kế `design/stitch/{reports,landing-pricing,privacy-data-deletion,terms-dpa,brand-guideline}`.

**Tóm tắt:** Dựng giao diện 4 màn khớp thiết kế Stitch, không đổi logic, không migration. Cả bốn chưa có trang thật (REPORTS chưa làm; PUBLIC-PAGES chờ tên miền + pháp lý) nên chỉ dựng trang mẫu dev `/dev/ui/{reports,landing,privacy,terms}` (chỉ khi `NODE_ENV!=='production'`), mọi số liệu/chữ mẫu gắn "[MẪU]". `brand-guideline` chỉ đối chiếu token: đã khớp `tokens.css`, không đổi. Rủi ro thấp (chỉ markup/CSS).

## Điểm chưa rõ

Không có (xem QRL1).

## Tiêu chí nghiệm thu

1. Bốn route `/dev/ui/{reports,landing,privacy,terms}` trả 404 khi production — kiểm bằng `notFound()` đầu trang + đọc code; ở dev trả 200 (chụp ảnh).
2. Không có huy hiệu/số liệu/cam kết bịa hiển thị như thật: mọi khối mẫu có "[MẪU]"; "Meta Tech Partner", "98.6%", MST/hotline/địa chỉ/chữ ký số bị thay hoặc bỏ — đọc code + ảnh.
3. Màu/chữ/khoảng cách chỉ dùng token (`tokens.css`), không hard-code hex — `grep '#[0-9a-f]\{3,6\}'` trong `reports-legal.css` rỗng.
4. Landing: nút Facebook không có, không nút Google; CTA trỏ `/register`.
5. Ảnh sau 1440px (+390px) ở `docs/plans/ui-fidelity/ui-reports-legal/` + PR liệt kê khớp/chưa khớp.
6. `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `precheck` xanh.

## File sẽ đọc / sửa

Đọc: 4 ảnh thiết kế, `tokens.css`, `dev/ui/leads/page.tsx` (mẫu), `layout.tsx`.
Tạo/sửa: `apps/web/src/styles/reports-legal.css` + import ở `app/layout.tsx`; `app/dev/ui/{reports,landing,privacy,terms}/page.tsx`; `docs/plans/quyet-dinh/qrl1.md`; `docs/codemap.d/mien-ui-reports-legal.md`; gap-matrix, MASTER, handoff, `docs/plans/ui-thieu-thiet-ke.md` (nếu cần).

## Migration

Không có.

## Test viết trước

Không có logic quy tắc (chỉ markup/CSS). Kiểm bằng typecheck/lint + ảnh chụp.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck` · `pnpm lint:i18n`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Trang thật cần: dữ liệu báo cáo (REPORTS), tra cứu xóa dữ liệu thật (callback Meta), văn bản pháp lý do luật sư duyệt, tên/địa chỉ/MST công ty → ghi gap, không bịa.

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
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có ở QRL1).
