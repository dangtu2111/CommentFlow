# Kế hoạch `feat-ui-fix-settings-gaps` — Sửa khoảng trống thừa ở khung Cài đặt

## Việc

Mã gap matrix: UI-first (nhóm Cài đặt) · Spec: `docs/08_UI_UX_Specification.md` §2, §7; `design/stitch/settings-{security,workspace-members,billing}.html`.

**Tóm tắt:** Chủ dự án thấy trang Cài đặt còn khoảng trống hai bên, khoảng trống lớn ở đầu trang Kênh/Thành viên và khoảng cách giữa các thẻ lớn/không đều. Nguyên nhân gốc nằm ở `SplitLayout`: nó dùng lưới một hàng cho mỗi thẻ và cho cột trái "trải 40 hàng" — cột trái cao hơn nội dung thì phần chênh lệch bị chia đều vào các hàng của thẻ, làm giãn khoảng cách. Sửa bằng bố cục thật sự hai cột (đầu trang → [cột trái | chồng thẻ]) với MỘT biến khoảng cách, không đổi logic nghiệp vụ, không migration.

## Điểm chưa rõ

Không có (tự chọn phương án khuyến nghị, ghi `q-uisgap1`).

## Tiêu chí nghiệm thu

1. Mọi trang con Cài đặt (Bảo mật, Kênh, Thành viên, Gói, Quyền riêng tư, Thông báo) dùng chung `SplitLayout` với prop `header`; khoảng cách dọc giữa thẻ liền kề = 16px và khớp HTML Stitch (≤ 2px) — kiểm bằng: `e2e/tools/settings-gaps.mjs` (Playwright, 1280/1440/1920/2560).
2. Khung nội dung chiếm hết bề ngang vùng chính (trừ padding 16px mỗi bên) ở 1280/1440/1920/2560 — cùng script đo.
3. Khoảng cách từ đáy thanh trên đến phần tử đầu tiên đồng nhất giữa các trang con — cùng script đo.
4. Không còn `display: contents`/`grid-row: span 40` trong `split-layout.css`; CSS khoảng cách theo biến `--settings-gap` — kiểm bằng: test `kit.test.tsx` + đọc CSS.
5. `pnpm precheck`, test web xanh.

## File sẽ đọc

`split-layout.{tsx,css}`, `settings-frame.tsx`, `globals.css` (`.app-page*`, `.settings-frame`), các page dùng `SettingsFrame` (đầu mỗi trang), `kit.test.tsx`.

## File sẽ sửa / tạo

`split-layout.tsx/.css` (prop `header`, cột nội dung dạng chồng), `settings-frame.tsx` (chuyển tiếp `header`), 6 page thật + 5 page `/dev/ui` (truyền `header`), `globals.css` (padding `.app-page-settings`, bỏ `.settings-frame` gap lẻ), `e2e/tools/settings-gaps.mjs` (đo), `docs/codemap.d/`, `docs/plans/quyet-dinh/q-uisgap1.md`, handoff.

## Migration

Không có.

## Test viết trước

Giao diện thuần: test kết xuất `SplitLayout` có `header` đứng trước lưới và không còn lớp trải hàng (`kit.test.tsx`).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui/kit.test.tsx`; `node e2e/tools/settings-gaps.mjs`.

## Cần kiểm chứng độc lập không?

Không (chỉ CSS/bố cục).

## Rủi ro / câu hỏi cho chủ dự án

Stitch không có lề ngang (class `mx-space-margin` không định nghĩa); giữ lề 16px mỗi bên cho dễ đọc.

## Đề xuất thay đổi

Không có.

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

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong spec/ADR hoặc `q-uisgap1`).
