## KT-OTE — Mã hóa token OAuth ở `accounts` (feat-oauth-token-enc)

Điều kiện: chưa có nhà cung cấp OAuth đăng nhập nào bật nên chưa có thao tác giao diện; kiểm bằng lệnh trên máy code.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/saas-core exec vitest run src/auth/oauth-token-vault.test.ts` | Tất cả test xanh (khứ hồi, sửa 1 ký tự bị từ chối, sai user/trường bị từ chối, xoay khóa v1→v2, thiếu khóa v1 báo lỗi cấu hình) |
| 2 | Đăng ký/đăng nhập email + mật khẩu như thường (không truyền cipher) | Hoạt động y như trước; bảng `accounts` không đổi hành vi |

Nếu hỏng: ghi tên test đỏ và dán thông báo lỗi (không dán khóa/token).
