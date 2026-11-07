## KT-PGVECTOR-HYBRID — Đổi model embedding trọn vẹn + tìm lai (PGVECTOR-HYBRID, EMBED-ACTIVE-MODEL, FR-057/133) · Embedding model switch and hybrid search

Chưa có giao diện; kiểm bằng lệnh trên DB thử (`cf_test`). / No UI; verify on the test DB.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/db run test:db tests/embedding-switch.int.test.ts`. | 10 test xanh: runtime không ghi được vector khác model đang hoạt động; web không gọi được hàm đổi model; đổi model đủ 100% mới chuyển, một giao dịch; ngắt giữa chừng → model cũ và vector cũ nguyên vẹn, truy vấn cũ vẫn chạy. |
| 2 | `pnpm --filter @flow/db run test:db tests/kb-hybrid-accuracy.int.test.ts`. | 2 test xanh (lai đúng cả truy vấn "ý nghĩa" và "mã chính xác"). |
| 3 | `pnpm --filter @flow/db run test:db tests/embedding-models.int.test.ts`. | 3 test xanh (đếm vector theo model, cô lập workspace). |

Nếu hỏng: dán tên test đỏ + dòng lỗi đầu tiên. / If it fails: paste the failing test name and the first error line.
