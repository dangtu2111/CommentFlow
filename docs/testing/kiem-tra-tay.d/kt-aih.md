## KT-AIH — Sức khỏe tích hợp & dead letter (ADMIN-INTEGRATION-HEALTH, FR-104)

Chỉ phần máy (chưa có giao diện, chưa nối connector): người thử chạy test.
1. `pnpm --filter @flow/shared exec vitest run src/integration-health.test.ts` → xanh. Mong đợi: chỉ Super Admin xem được; ngưỡng ok/suy giảm/sập đúng; thông báo lỗi bị che email/SĐT/chuỗi giống token.
2. `pnpm test:db` (cần `.env` + máy phụ bật), file `integration-health.int.test.ts` → xanh. Mong đợi: chỉ worker ghi được sự cố; support/finance/Owner đọc tổng hợp và dead letter bị từ chối; payload webhook không lộ.
