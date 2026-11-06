# Bàn giao `feat-invoices` (INVOICES, làn b, claude)

**Đã làm:** `core.invoices` + `core.payments` (migration 0052), 3 hàm DEFINER chỉ `withJob`/`cf_worker` (tạo, xác nhận đúng tiền, hủy), lớp truy vấn `packages/db/src/invoices.ts`, logic thuần `packages/shared/src/invoice.ts` (property-based), kỳ vọng RLS ở `check-rls.ts`, int test `invoices.int.test.ts`. Verifier-db + verifier-security đã chạy một lần; mục chặn (tiền `bigint`) và các mục "nên sửa" chính đã xử lý (xem Q-INV1).

**Đã đọc, rút ra:** mẫu `core.consume_usage` (0039) cho hàm DEFINER chỉ `cf_worker`; `check-rls.ts` có nhiều danh sách phải cập nhật (ACTOR_POLICIES, NO_DELETE, whitelist hàm của `cf_worker`); `tx.transaction()` bị cấm trong `withJob` → dùng SAVEPOINT; `test:db` gốc dừng ở gói `ai` (khóa LiteLLM thiếu, không liên quan) → chạy `pnpm --filter @flow/db test:db`.

**Còn lại:** UI lịch sử hóa đơn + thông tin xuất hóa đơn; QR + chuyển khoản (`QR-PAYMENT`, chờ tài khoản nhận tiền); hàm bao Admin xác nhận + `action_logs` + kiểm `confirmed_by` (`ADMIN-PAYMENTS`); `subscription_id` (`PLANS-SCHEMA`); quy tắc lưu trữ hóa đơn khi xóa workspace (hiện cascade); index `payments(workspace_id)`.

**Lưu ý triển khai:** migrate trước, chưa có nơi gọi trong runtime. Không có tài nguyên ngoài nên không thêm mục `CAN_BAN_CUNG_CAP`.
