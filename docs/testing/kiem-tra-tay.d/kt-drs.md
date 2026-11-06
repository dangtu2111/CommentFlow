## KT-DRS — Quy tắc tồn kho của decideAction (DA-RULES-STOCK, FR-151/157, feat-da-rules-stock)

> Hàm thuần chưa nối giao diện/pipeline nên kiểm bằng lệnh. / Pure functions, not wired to UI yet — verify by command.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/decide/stock-rules.test.ts` | Mọi test xanh: tồn cũ hơn 3 ngày (nhập tay/Excel) → không nói còn/hết hàng; đúng ngưỡng vẫn tươi. |
| 2 | Xem nhóm "FR-157 gợi ý thay thế" trong cùng file | Chỉ gợi ý khi bật; tối đa 2 mẫu cùng danh mục, đang bán, còn hàng, kèm giá từ biến thể. |
| 3 | `pnpm --filter @flow/ai test:coverage` | Đạt ngưỡng; `src/decide/*.ts` ≥ 95% nhánh. |
