## KT-RT — Tìm kiến thức cho nhãn cần trả lời (PIPE-RETRIEVE, FR-028, feat-pipe-retrieve)

Hàm thuần + cổng (embedder là bản mock), chưa có giao diện/đường chạy → kiểm bằng lệnh. Kiểm tay thật khi pipeline được nối. / Pure core with mock embedder; verify by command.

| # | Việc | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/retrieve` | Xanh (ví dụ + property-based), không gọi mạng/LLM/DB |
| 2 | Khi nối pipeline: bình luận khiếu nại ("hàng lỗi, đòi hoàn tiền") | Không tìm kiến thức, không có bản nháp AI; chuyển người |
| 3 | Bình luận "giá sao shop" dưới bài gắn sản phẩm | Nguồn chỉ là biến thể từ `product_variants` (giá/tồn đúng kho), không có đoạn kiến thức |
| 4 | Bình luận "đổi trả thế nào" | Nguồn là đoạn FAQ/chính sách liên quan nhất, tổng ≤ ~3.000 token |
