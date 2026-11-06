# Bàn giao — nhánh `feat-ui-html-settings`

Cập nhật: 2026-11-06 · Mục gap matrix: UI-HTML-SETTINGS · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-ui-html-settings.md`

## Đã làm
- Khung Cài đặt: lưới 3/12 + 9/12, đầu trang chiếm cả hàng, lề 24px; `SectionHead` biểu tượng trần (+ `hero`), ô thông tin/phiên cỡ chữ Stitch; `PageHeader` bọc `<header>`; trang Kênh dùng `PageHeader`.
- Đo bbox + ảnh: `e2e/support/measure-settings.mjs` → `docs/plans/ui-fidelity/ui-html-settings/` (security, members, billing; 1440/390).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `design/stitch/settings-security.html` | Tailwind CDN: lớp `px-space-margin` không tồn tại nên bbox Stitch tự lệch lề; lấy ý định (24px) thay vì số đo |
| `ui/split-layout.css` | View trả Fragment ⇒ không thể tách đầu trang bằng React; dùng `display: contents` + margin |

## Còn lại
1. `UI-HTML-SETTINGS-MODALS`: tinh chỉnh pixel hộp thoại 2FA bật/tắt, đổi mật khẩu, trang "đã đổi mật khẩu" theo HTML.
2. Cỡ chữ nền của thẻ Thành viên/Gói (dòng, nút) còn lớn hơn Stitch (13px) — cần chỉnh token chữ chung.

## Lệnh test liên quan
```
pnpm --filter @flow/web exec vitest run src/components/ui
node e2e/support/measure-settings.mjs   # cần cổng xem trước :3101
```
