## KT-ST — Bảng size có cấu trúc (SIZE-TABLE, FR-149, US-102) · Size chart

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/size-chart.test.ts`. | 14 test xanh: cao 160 + nặng 53 → M; thiếu số đo → hỏi lại; hai size cùng khớp / ngoài bảng → mời ib; không có bảng → mời ib + ghi khoảng trống. |
| 2 | CI job `database` chạy `tests/size-charts.int.test.ts`. | Owner ghi được, Staff chỉ đọc, workspace khác không thấy; bảng riêng của sản phẩm thắng bảng danh mục. |
