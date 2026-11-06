## KT-ADP — Quản trị gói cước & mã giảm giá (ADMIN-REST phần dữ liệu, FR-104)

Chỉ phần máy (chưa có giao diện, chưa nối thanh toán; không cần khóa/dịch vụ ngoài): người thử chạy test.
1. `pnpm --filter @flow/shared exec vitest run src/coupon.test.ts` → xanh. Mong đợi: chỉ Super Admin sửa, Super + Finance xem; mã được chuẩn hóa; hạn dùng/trần lượt/gói áp dụng/số tiền giảm đúng ở các biên.
2. `pnpm test:db` (cần `.env` + máy phụ bật), file `admin-billing.int.test.ts` và `check-rls.int.test.ts` → xanh. Mong đợi: web/worker không đọc trực tiếp bảng mã; Finance/Support/Owner không sửa được gói/mã; Owner áp mã đúng; 5 workspace tranh mã tối đa 2 lượt chỉ thành công đúng 2; Staff và workspace khác bị từ chối; lượt dùng không lộ chéo workspace.
