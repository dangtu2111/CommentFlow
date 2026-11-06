## KT-PLN — Gói cước, dùng thử, mua thêm lượt (PLANS-SCHEMA, FR-090, US-060, Q-PLN1) · Plans store

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/plan.test.ts`. | Xanh: hết dùng thử/hết kỳ/đã hủy → hạn mức 0; `past_due` còn kỳ giữ hạn mức nhưng không tự gửi; thiếu gói → không cho dùng. / Green: expired, canceled or missing plans grant nothing. |
| 2 | CI job `database` chạy `tests/plans.int.test.ts` và `pnpm db:check-rls`. | Bảng giá có đúng 5 gói; web không ghi được bảng giá hay gói; workspace khác không thấy gói của mình; chỉ job hệ thống đúng workspace bắt đầu dùng thử/đặt gói/cộng lượt mua thêm; dùng thử chỉ một lần; lượt mua thêm dùng được ngay và không mất khi mua đồng thời. / Web cannot write plans; cross-workspace isolation; trial once; add-on turns counted. |
| 3 | Mở bảng giá trong DB dev: `SELECT code, price_vnd, monthly_turns FROM core.plans ORDER BY price_vnd;` (máy ảo). | Giá khớp mục CAN_BAN_CUNG_CAP `PLANS-SCHEMA`; báo lại nếu cần đổi. |
| 4 | (Sau khi có `TRIAL-UPGRADE-UI`) đăng ký, xem thẻ gói, nâng gói, mua thêm lượt. | Chưa áp dụng — giao diện là việc sau. |
