# Bàn giao `feat/shopify-product-card` (claude)

**Làm gì:** đồng bộ Shopify lấy `description`/`tags`/`productType`/metafield `custom.*` vào `products.card` (jsonb có sẵn, KHÔNG migration), gộp khi ghi, và đưa vào câu nguồn của AI ("Chi tiết: chất liệu …"). Quyết định: `Q-SPC1` (thêm khóa `description` vào thẻ → đã sửa FR-058 ở docs/05).

**An toàn giá (nguyên tắc #4):** mọi câu có số tiền bị loại bằng `cleanCardText` ở lúc ghi VÀ lúc đọc; giá chỉ lấy từ biến thể. Có test mô tả "Giá chỉ 99k" không lọt vào thẻ/câu nguồn.

**Đã kiểm trên DB thật `cf_test`:** ghi gộp thẻ (khóa nguồn thắng, khóa người dùng giữ, nguồn không có thẻ → giữ nguyên), `loadTryProducts` trả thẻ hợp lệ và bỏ thẻ hỏng.

**Chưa làm:** thử trên shop Shopify thật (quyền đọc metafield `custom.*`); giao diện sửa thẻ; thẻ cho Haravan/Sapo/KiotViet/Pancake. Kế tiếp: tiền tệ khác VND (để giá trống, cảnh báo Owner, AI chuyển hướng, không quy đổi) rồi PIPE-ORCHESTRATOR + drafts.
