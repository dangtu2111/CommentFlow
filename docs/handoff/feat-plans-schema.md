# Bàn giao `feat-plans-schema` (PLANS-SCHEMA, làn b, claude)

**Đã làm:** migration 0054 (`core.plans` seed 5 gói, `core.subscriptions` RLS đọc thành viên, 3 hàm DEFINER chỉ `withJob`/`cf_worker`: `start_trial`, `activate_plan`, `grant_usage_addon`), lớp truy vấn `packages/db/src/plans.ts`, logic thuần `packages/shared/src/plan.ts` (`resolvePlanState` fail-closed), `createPlanStatusReader` ở saas-core (gói + đồng hồ lượt, `aiAllowed`), kỳ vọng RLS `checkPlanTablesAndFunctions`, int test `plans.int.test.ts`. Verifier-db + verifier-security đã chạy một lần: không có mục chặn; giới hạn đã biết ghi ở Q-PLN1 (f).

**Đã đọc, rút ra:** mẫu hàm DEFINER của 0039/0052; `check-rls.ts` cần cập nhật SYSTEM_TABLES, NO_DELETE, whitelist hàm `cf_worker` + `check-rls.test.ts` (fake DB theo thẻ comment SQL); `drizzle-kit generate` sinh SQL + snapshot rồi nối phần RLS/hàm thủ công; đồng hồ DB (máy ảo) lệch máy test → test thời gian dùng đồng hồ DB; `pnpm test:db` chạy đủ (cần `.env`); `db:check-rls` CLI chạy trên `cf_dev` nên phải `pnpm db:migrate` trước.

**Còn lại (cần migration mới của làn b):** gắn `grant_usage_addon`/`activate_plan` với hóa đơn `paid` + bảng chống cộng lặp (`p_invoice_id`), `invoices.subscription_id`, hàm ghi `past_due`/`canceled`/`cancel_at`, index `period_end`, điều kiện đơn điệu của `activate_plan`. Việc khác làn: nối `consume` lấy hạn mức từ gói + `workspaces.timezone` + kiểm `aiAllowed` (`USAGE-GATE-PIPE`), gọi `start_trial` khi tạo workspace, UI gói/nâng/mua thêm (`TRIAL-UPGRADE-UI`), QR (`QR-PAYMENT`).

**Lưu ý triển khai:** migrate trước; chưa có nơi gọi trong web/worker. Giá seed chờ chủ dự án xác nhận (CAN_BAN_CUNG_CAP `PLANS-SCHEMA`, KT-PLN).
