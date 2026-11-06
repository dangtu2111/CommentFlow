# Bản đồ source (codemap)

> Lập **một lần** ở GĐ0 (lệnh `/codemap-init`), sau đó chỉ thêm/sửa FILE RIÊNG trong `docs/codemap.d/` (một hàng một file) rồi `pnpm codemap:build` trong cùng commit thay đổi code — file này là bản SINH RA, không sửa tay. Mục đích: Claude đọc file này thay vì quét lại repo. Giữ dưới ~150 dòng; mỗi dòng một file/thư mục quan trọng.

Cập nhật lần cuối: 2026-11-06 · nhánh `feat-auto-send-gate` · Gói nội bộ: `@flow/*` (dùng thẳng mã nguồn TS, không build riêng; Node 24, pnpm, TypeScript 6.0.3)
