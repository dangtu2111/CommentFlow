## KT-PR — Định tuyến theo ý định (PIPE-ROUTE, FR-136, feat-pipe-route)

Hàm thuần, chưa có giao diện/đường chạy → kiểm bằng lệnh. Kiểm tay thật khi `PIPE-RETRIEVE` nối `route`. / Pure function, no UI yet; verify by command.

| # | Việc | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/ai exec vitest run src/route` | Xanh (ví dụ + property-based) |
| 2 | Khi nối pipeline: dưới bài gắn sản phẩm, bình luận "giá sao shop" | `retrieval_logs.route = sql`; không có lượt gọi rerank/vector |
| 3 | Bình luận "lấy 2 cái size M ship về Cà Mau bao nhiêu" | `route = both` (có ý ship), câu trả lời có đơn giá biến thể M từ DB |
| 4 | Bình luận "giá sao" dưới bài không gắn sản phẩm, tên sản phẩm không nhận ra | `route = both` (không bao giờ `sql`) |

### KB-CHUNKING (FR-055/130/131; chưa có giao diện)

| # | Việc | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `CF_LANE=b pnpm test:db` (hoặc xem job `database` của CI) | `kb-chunks.int.test.ts` xanh (ghi nháp qua worker, tsv bỏ dấu, lọc hạn hiệu lực) |
| 2 | `pnpm --filter @flow/shared exec vitest run src/kb-chunking.test.ts` và `pnpm --filter @flow/ai exec vitest run src/kb-indexing.test.ts` | Xanh; embedding chỉ là mock, không gọi mạng |

### PIPE-RULE-FILTER + PIPE-MERGE-BURST (FR-024, FR-148; chỉ lõi hàm thuần, chưa nối pipeline — KT-032)

| # | Việc | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/rule-filter.test.ts src/merge-burst.test.ts` | Xanh; không gọi mạng/DB/LLM |
| 2 | Đọc nhanh `rule-filter.test.ts`: emoji/tag/dấu chấm → bỏ qua; "giá?", "1", "+", ảnh đính kèm → không bỏ qua | Khớp ý bạn muốn (nếu muốn nới/thắt, nói để đổi Q-PRF1) |
| 3 | Khi pipeline được nối: gõ 3 bình luận ngắn liên tiếp dưới một bài | Một câu trả lời gộp vào bình luận cuối (US-109) |

### ABBREV-DICT (FR-025, FR-050; chỉ dữ liệu + truy vấn, chưa có giao diện/chưa nối pipeline — Q-AD1)

| # | Việc | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared run test src/abbreviation.test.ts` | Xanh; không gọi mạng/DB |
| 2 | Sau khi migrate `0041`: `SELECT short, full FROM cf.system_abbreviations WHERE lang = 'vi' ORDER BY short;` | Có "ib → inbox", "sz → size", "dc → được", "k → không"… Soát danh sách: từ nào sai/thiếu thì báo để thêm bằng migration mới |
| 3 | Khi có giao diện (`KB-ABBREV-UI`): Owner thêm "cod" → "thanh toán khi nhận hàng", đăng nhập Staff | Staff thấy mục nhưng không thêm/sửa/xóa được; shop khác không thấy |
