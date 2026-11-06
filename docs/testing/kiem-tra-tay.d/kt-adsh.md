## KT-ADSH — Phiên Admin 8 giờ + nhật ký thao tác Admin (ADMIN-SHELL phần DB, FR-100)

Chỉ phần máy (chưa có giao diện/middleware): người thử chạy test.
1. `pnpm --filter @flow/shared exec vitest run src/admin-audit.test.ts` → xanh. Mong đợi: phiên đúng 8 giờ/hết hạn/không phải phiên Admin bị chặn; chỉ Super xem nhật ký; chi tiết nhật ký bị che email/SĐT/token.
2. `pnpm test:db` (cần `.env` + máy phụ bật), file `admin-audit.int.test.ts` → xanh. Mong đợi: người thường/Owner/worker/phiên hết hạn/phiên của người khác bị từ chối; không ai sửa hoặc xóa được dòng nhật ký (kể cả chủ bảng); support/finance không đọc được nhật ký.
