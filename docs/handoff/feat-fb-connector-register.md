# Bàn giao — nhánh `feat/fb-connector-register`

Cập nhật: 2026-11-06 · Mục gap matrix: FB-CONNECTOR-REGISTER(+PRECONDITIONS), SEND-FIND-REPLY-BY-PARENT · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-fb-connector-register.md`

## Đã làm
- Cờ `FB_CONNECTOR_ENABLED` + `buildConnectorRegistry` (worker), `findExistingReply` theo cha, hook `onBlocked` (368 chỉ log), test biên 256 KB webhook.

## Còn lại
1. `SEND-SUSPEND-ADMIN` (ghi `send_suspended_until`, cần migration), `SEND-SWEEP`/`HIDE-SWEEP` (làn b) trước khi bật cờ ở môi trường thật.
2. Chạy `pnpm test:db` (send.int.test.ts có ca BLOCKED mới) trên máy phụ — chưa chạy ở làn này (không có DB).
3. Từ verifier-security (nên sửa trước khi bật cờ ở Page thật): (a) lỗi TOKEN_EXPIRED/PERMISSION/BLOCKED ở bước kiểm của lượt tiếp quản vẫn mất dấu "có thể đã đăng" (đã sửa riêng RATE_LIMIT); (b) so khớp nội dung chuẩn hóa xuống dòng/khoảng trắng; (c) hook onBlocked chỉ nên gọi khi ghi `failed` thành công; (d) kiểm trả lời cấp 2 của `fetchReplies` trên Page thử; (e) cờ bật cả `hide`.
4. Page thử + KT-016/KT-012.
