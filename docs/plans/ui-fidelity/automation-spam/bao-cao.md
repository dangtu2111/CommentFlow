# Báo cáo đủ thành phần — Tự động hóa + Quy tắc spam (feat-ui-complete-automation-spam)

Nguồn dựng duy nhất: `design/stitch/automation.html`, `design/stitch/spam-rules.html`. Công cụ: `e2e/support/ui-completeness.mjs` (so chữ vùng `<main>`, bỏ số liệu/`[MẪU]`).

| Màn | Khớp trước | Khớp sau | Báo cáo chi tiết |
|---|---|---|---|
| `/app/automation` (`/dev/ui/automation`) | 13,0% (vỏ ứng dụng gộp: 15/115) | **96,5%** (83/86) | `automation-completeness.md` |
| `/app/spam-rules` (`/dev/ui/spam-rules` + `?view=logs`) | 4,6% (8/174) | **98,3%** (171/174) | `spam-rules-completeness.md` |

## Mục thiếu có chủ ý (lý do)

- "Mục 7.3c": nhãn mục spec của bản thiết kế, không phải nội dung sản phẩm → bỏ.
- "Mọi thay đổi cấu hình tự động được lưu và cập nhật ngay lập tức.": không đúng sự thật (phải bấm Lưu; cấu hình chưa nối cổng gửi) → thay bằng câu đúng.
- "Áp dụng cho toàn bộ kênh": nút lưu thật gọi là "Lưu cài đặt".
- "Đã đạt điều kiện kiểm chứng Dry-run": khẳng định điều kiện chưa có thật (Tự ẩn chưa có) → thay bằng "Cần chạy thử… · Sắp có".
- "Kích hoạt quy tắc": nút lưu thật gọi là "Lưu quy tắc".
- "Đã cập nhật quy tắc thành công!": toast hiện sau khi lưu (câu thật: "Đã lưu quy tắc."), không có ở trạng thái mặc định.

## Thành phần dùng lại / thêm mới

- Dùng lại: `Card`, `SectionHead`, `Inset`, `Chip`, `Button`/`buttonClass`, `Banner`, `Breadcrumb`, bảng `.table`.
- Thêm mới vào kit (đều dùng ≥ 2 nơi): `Switch`, `Progress`, `MetricCard`, `PlatformBadge`.
- Mở rộng kit: `Tabs` (biến thể `toolbar`, tab `disabled`), `Chip` (tông `solid/accent/warm/danger/locked`), `PageHeader` (`icon/badge/actions`), `Inset` (cột `minmax(0,1fr)` chống tràn).
- Riêng từng màn (chỉ 1 nơi dùng): `ThresholdSlider`, `KeywordChips`, `SpamRuleList`, `SpamHiddenLog`, `SpamRuleBuilder`.
- Không copy JSX/CSS giữa hai trang; trang thật và `/dev/ui/*` dùng chung `AutomationView`/`SpamRulesView`.

## Số dòng trước → sau

| Nhóm | Trước | Sau |
|---|---|---|
| `automation-form.tsx` + `spam-rule-builder.tsx` | 249 + 107 = 356 | 364 + 339 (+ header/metrics/view/list/log/… tách file, tổng TSX hai màn 1.617) |
| `automation.css` + `spam-rules.css` | 180 + 93 = 273 | 413 + 645 (đã gồm bố cục của ~10 thành phần mới) |
| Kit mới (TSX + CSS) | 0 | 364 |

Số dòng tăng vì hai màn từ ~5 thành phần lên đủ ~40 thành phần của thiết kế (không phải trùng lặp: không còn khối nào lặp giữa hai trang). Không thêm CSS vào `globals.css`.

## So bounding box / style (`so-bbox.json`, 1440px)

Chiều cao/cỡ chữ của phần tử chính đo bằng `e2e/support/measure-automation.mjs`; trang mẫu dev không có vỏ ứng dụng (thanh bên 256px) nên chiều rộng cột khác Stitch (848px so với 1152px) và các chiều cao phụ thuộc xuống dòng sẽ lệch; phần tử độc lập bề rộng: tiêu đề 22px (khớp Stitch), đầu bảng 13px/đệm 12px 16px, viên chế độ 11px, thẻ số liệu tiêu đề 16px. Còn lệch > 2px đã biết: chiều cao nút chính ở trình thiết lập spam và thẻ quy tắc (do bề rộng hẹp hơn). Cần đo lại khi có `AppShell` trên cùng route.

## Ảnh

`automation-sau-1440.png`, `automation-sau-390.png`, `spam-rules-sau-1440.png`, `spam-rules-sau-390.png`, `*-stitch-1440.png`.

Cuộn ngang 390px: `spam-rules` không tràn; `automation`: công cụ `find-overflow.mjs` không thấy phần tử tràn ngoài vùng tự cuộn (vẫn ghi `overflow390: true` trong `so-bbox.json` — còn theo dõi).
