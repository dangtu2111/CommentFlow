## KT-DRP — Quy tắc giá của decideAction (DA-RULES-PRICE, FR-150/158, feat-da-rules-price)

> Hàm thuần chưa nối giao diện/pipeline nên kiểm bằng lệnh. / Pure functions, not wired to UI yet — verified by command.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/rules` | 32 test xanh: caption lệch giá kho → conflict kèm hai con số; khách nhắc giá khác → chuyển người; khoảng giá "từ X đến Y" + trục cần hỏi lại. |
| 2 | `pnpm --filter @flow/ai test:coverage` | Đạt ngưỡng; `src/rules/*.ts` ≥ 95% nhánh. |
