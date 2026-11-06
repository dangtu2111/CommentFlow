## KT-CG — Cổng chi phí AI (COST-GATE, FR-071, feat-cost-gate)

> Chưa nối giao diện/pipeline nên kiểm bằng lệnh. / Not wired to UI yet — verify by command.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/cost-gate` | Mọi test xanh (gồm property-based: cho gọi ⇒ tổng ≤ trần; chi tiêu tăng không bao giờ mở lại cổng). / All green. |
| 2 | Xem test "sẽ vượt trần → KHÔNG gọi LLM" trong `gated-llm-client.test.ts` | Client thật không được gọi; lỗi `COST_CAP_REACHED`. / Inner client never called. |
| 3 | Xem test "gọi song song cùng workspace" | 5 lần gọi cùng lúc, trần $0,05, ước tính $0,02 → đúng 2 lần được gọi. / Exactly 2 allowed. |
| 4 | Trên DB dev có quyền: `pnpm --filter @flow/ai test:db` (chạy `tests/cost-ledger.int.test.ts`) | Tổng chi tính từ 00:00 UTC ngày 1, bỏ tháng trước, không lẫn workspace. / Month-to-date sum per workspace. |
