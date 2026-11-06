## KT-PLP — Gắn sản phẩm vào bài (POSTS-LINK-PRODUCT, FR-061, US-032) · Link products to posts

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/post-products.test.ts`. | 14 test xanh: loại trùng, sản phẩm chính phải nằm trong danh sách, trần 200 bài × 20 sản phẩm, đề xuất AI chưa xác nhận không được dùng để trả lời. |
| 2 | CI job `database` chạy `tests/post-products.int.test.ts` và `pnpm db:check-rls`. | Gắn nhiều sản phẩm, tối đa một chính/bài, gắn hàng loạt không trùng; worker chỉ tạo được đề xuất, không tự xác nhận; workspace khác không thấy. |
