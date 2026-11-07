# Bàn giao `feat/shopify-non-vnd-currency` (claude)

**Làm gì:** cửa hàng Shopify dùng tiền tệ khác VND — giá để trống (đã có), KHÔNG quy đổi; (1) job đồng bộ ghi `currencyUnsupported` + `variantsWithoutPrice` vào tóm tắt (jsonb, không migration); (2) thẻ Shopify hiện cảnh báo cho Owner (vi/en); (3) khi khách hỏi giá mà sản phẩm chưa có giá, nguồn đánh dấu `priceUnknown` → chủ đề giá coi là chưa nguồn → `redirect` + `kb_gaps`; tồn kho/size/chất liệu vẫn trả lời. Quyết định: `Q-SNV1`.

**Lưu ý:** nhánh này tách từ `main` chưa có #243 (sửa `classifyAsk` "tồn kho"); test của nhánh dùng ý hỏi "còn hàng" nên độc lập.

**Chưa làm:** nhập tay giá thay thế; thử trên shop Shopify thật dùng USD; Haravan/Sapo/KiotViet (VND-only) không đổi. Kế tiếp: PIPE-ORCHESTRATOR + drafts.
