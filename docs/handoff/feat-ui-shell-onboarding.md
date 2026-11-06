# Bàn giao `feat-ui-shell-onboarding` (claude, làn a)

## Đã làm
Plan `docs/plans/feat-ui-shell-onboarding.md` (đã duyệt, Q-UIS1). Khung ứng dụng (thanh bên có biểu tượng + thẻ người dùng, chuông thông báo từ cảnh báo kênh thật, banner kiểu thanh cảnh báo), thanh 5 bước onboarding, 404, 403 (`/app/forbidden`), thẻ "Khôi phục kết nối" ở trang Kênh, trang mẫu `/dev/ui` ([MẪU], tắt ở production). Hàm thuần có test: `user-initials`, `onboarding-steps`, `notification-model`, `splitNavByRole`.

## Đã đọc + rút ra
- Máy lane không có `.env`/DB → không chụp được trang cần phiên (onboarding, 403, trang Kênh). Đã chụp `/dev/ui` (khung 1440 + 390) và 404 → `docs/plans/ui-fidelity/ui-shell/`.
- Lỗi có sẵn trên main (không thuộc việc này): `activity.actions` trong `vi.json`/`en.json` có khóa chứa dấu chấm (`workspace.created`…) → next-intl ném `INVALID_KEY` ở dev (hiện "Issues" trong overlay). Nên sửa ở việc riêng của trang Nhật ký.
- Lint i18n chỉ miễn các thuộc tính trong `eslint.config.mjs` (`href`, `active`…) và chỉ nhận biến dịch tên `t`.

## Còn lại
- Chụp + so onboarding/403/thẻ khôi phục khi có DB dev (hoặc dùng `pnpm dev:seed-demo` khi `feat-dev-seed-demo` merge).
- Chưa dựng (không có dữ liệu thật): số đếm mục điều hướng, SLA, "AI tự động", Dừng khẩn cấp, lọc nền tảng (`SHELL-TOPBAR`).
