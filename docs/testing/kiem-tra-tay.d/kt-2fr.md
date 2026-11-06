## KT-2FR — Khôi phục 2FA khi mất điện thoại (AUTH-2FA-RECOVERY, feat-auth-2fa-recovery) — chỉ làm được khi đã nối giao diện + bảng DB

> Hiện mới có logic + test tự động (`pnpm --filter @flow/saas-core exec vitest run src/auth/recovery`); chưa có màn hình/bảng lưu bền. Các bước dưới dành cho lúc đã nối.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Tài khoản THỬ có 2FA: ở màn đăng nhập chọn "Mất điện thoại", nhập email | Luôn báo "Nếu email đúng, bạn sẽ nhận thư"; nhập email lạ cũng báo y hệt |
| 2 | Bấm link xác minh trong thư | Báo bắt đầu thời gian chờ 72 giờ; hộp thư nhận thêm thư báo có link Hủy |
| 3 | Thử hoàn tất ngay | Báo chưa đến hạn chờ |
| 4 | Admin nền tảng khác duyệt sớm, rồi hoàn tất bằng link + mật khẩu | 2FA tắt, mọi thiết bị bị đăng xuất; nhận thư báo hoàn tất |
| 5 | Làm lại từ đầu, bấm Hủy trong thư báo | Không hoàn tất được nữa |
| 6 | Gõ sai mật khẩu 6 lần liên tiếp ở bước hoàn tất | Bị chặn tạm, báo thử lại sau |
