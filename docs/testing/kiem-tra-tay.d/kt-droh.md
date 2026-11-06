## KT-DROH — Hỏi đơn hàng + câu mời theo giờ làm việc (DA-RULES-ORDER-HOURS, FR-153/152, feat-da-rules-order-hours)

> Hàm thuần chưa nối giao diện/pipeline nên kiểm bằng lệnh. / Pure functions, not wired to UI yet — verify by command.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/decide/order-hours-rules.test.ts` | Mọi test xanh: "đơn đến đâu", "sao chưa giao", "where is my order" → hỏi đơn → `decideAction` chuyển hướng + chuyển người; "chốt đơn", "đơn giá" không bị nhầm. |
| 2 | Xem nhóm "FR-152 resolveInvitation" trong cùng file | Trong giờ dùng mẫu `inHours`; ngoài giờ/chưa rõ giờ dùng `outHours`; mẫu ngoài giờ có "gọi ngay" bị thay bằng câu "từ 08:00 ngày mai". |
| 3 | `pnpm --filter @flow/ai test:coverage` | Đạt ngưỡng; `src/decide/*.ts` ≥ 95% nhánh. |
