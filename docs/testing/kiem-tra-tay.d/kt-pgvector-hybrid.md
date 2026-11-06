## KT-PGVECTOR-HYBRID — Tạo lại embedding + tìm lai (PGVECTOR-HYBRID, FR-057/133) · Re-embedding and hybrid search

Chưa có giao diện; kiểm bằng lệnh trên DB thử (`cf_dev`/`cf_test`, không migration mới). / No UI; verify on a test DB, no new migration.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/kb-reembed` và `pnpm --filter @flow/worker exec vitest run src/jobs/kb-reembed.test.ts src/config-kb-reembed.test.ts`. | Xanh (lô, chạy lại = 0, hash lệch bị bỏ qua, cờ TẮT mặc định). |
| 2 | `pnpm --filter @flow/db run test:db tests/kb-reembed.int.test.ts`. | 6 test xanh (chỉ đoạn khác mô hình; nội dung/tsv/phiên bản không đổi; chéo workspace và ngoài `withJob` đều không ghi được; lọc mô hình ở nhánh vector). |
| 3 | `pnpm --filter @flow/db run test:db tests/kb-hybrid-accuracy.int.test.ts`. | 2 test xanh (lai đúng cả truy vấn "ý nghĩa" và "mã chính xác", mỗi nhánh đơn chỉ đúng một). |
| 4 | Kiểm `KB_REEMBED_ENABLED` trong `.env` của worker để trống. | Worker không đăng ký hàng đợi `kb-reembed` (nhật ký không có dòng "kb-reembed xong"). |

Nếu hỏng: dán tên test đỏ + dòng lỗi đầu tiên. / If it fails: paste the failing test name and the first error line.
