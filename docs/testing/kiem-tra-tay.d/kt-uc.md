## KT-UC — Bộ đếm lượt AI (USAGE-COUNTERS, FR-090)

Chỉ phần máy (chưa có giao diện): người thử cần `pnpm db:migrate` (DB dev/test của bạn) rồi chạy test.
1. `CF_LANE=<làn> pnpm test:db` → file `usage-counters.int.test.ts` xanh (đua 20 lệnh song song chỉ cho đúng 10 lượt). Kết quả mong đợi: không test đỏ.
2. `pnpm db:check-rls` → không báo vi phạm `core.usage_counters`/`core.consume_usage`. Kết quả mong đợi: "đạt".
3. (vi + en, USAGE-METER-UI, Q-UMU1) Owner mở Cài đặt → thẻ "Lượt AI trong tháng" có thanh tiến độ. Đặt `AI_TURNS_PLAN_LIMIT` nhỏ và sửa số đã dùng ở DB dev: từ 80% hiện banner vàng "Sắp hết lượt AI", 100% banner đỏ "Đã hết lượt AI" kèm gợi ý mua thêm/nâng gói. Staff không thấy thẻ này.

---
