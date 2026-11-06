# Bàn giao `feat-ui-settings` (claude, làn a)

## Đã làm
Plan `docs/plans/feat-ui-settings.md` (Q-UIST1). Giao diện Cài đặt (thẻ 2FA/tài khoản/đổi mật khẩu/phiên/ngôn ngữ; hộp thoại `<dialog>` cho bật-tắt 2FA, tạo lại mã, đổi mật khẩu), Thành viên (`MembersView` tách khỏi page), Nhật ký (chip tông + ảnh đại diện). Hàm thuần có test: `lib/settings-visual.ts`. Trang mẫu `/dev/ui/{settings,members,activity}`. Ảnh ở `docs/plans/ui-fidelity/ui-settings/`.

## Đã đọc + rút ra
- Giữ nguyên Server Action và tên trường form; `/app/security` khi bắt buộc 2FA mở sẵn hộp thoại bật (`defaultOpen`) để e2e `flows.ts` điền mật khẩu như cũ.
- `lint:i18n` chỉ bắt chuỗi trong JSX; mẫu dữ liệu phải để ở hằng module và dùng `t(...)` tên `t`.
- Server `next dev` cũ ở 3100 không nạp lại JSON của `@flow/shared`; chụp bằng server riêng (sửa tạm `distDir` rồi hoàn lại).

## Còn lại
- `UI-FIDELITY-SETTINGS-DATA` (billing, KPI nhật ký, ma trận quyền, màn đổi mật khẩu xong…) — cần dữ liệu/chức năng thật.
- Chụp so sánh trên trang thật khi có `pnpm dev:seed-demo`; chạy e2e gate0 trên staging để xác nhận luồng bật 2FA qua hộp thoại.
