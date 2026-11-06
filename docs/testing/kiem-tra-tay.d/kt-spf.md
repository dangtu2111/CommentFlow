## KT-SPF — Thông tin shop, chính sách, FAQ, giọng văn (KB-SHOP-POLICY-FAQ, feat-kb-shop-policy-faq, migration 0036) · Shop info, policy, FAQ, brand voice tables

Chưa có giao diện (làm ở `KB-CONTENT-UI`). Kiểm bằng lệnh trên DB thử. / No UI yet; verify with commands on a test DB.

| # | Việc | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `CF_LANE=b pnpm test:db` (hoặc xem job `database` của CI) | `kb-content.int.test.ts` xanh |
| 2 | Chạy `CF_LANE=b pnpm db:check-rls` | Không vi phạm |
| 3 | Dùng tài khoản Staff ghi thử FAQ (qua test) | Bị chặn (42501); Staff đọc được |
