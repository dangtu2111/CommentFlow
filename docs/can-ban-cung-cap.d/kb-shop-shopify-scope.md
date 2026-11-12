## KB-SHOP-V2 — Quyền đọc thông tin cửa hàng Shopify (đề xuất điền "Thông tin cửa hàng")

- **Cần gì:** xác nhận trên một cửa hàng Shopify thật rằng token hiện có (`read_products`, và `read_legal_policies` nếu đã cấp) đọc được `shop { name contactEmail primaryDomain { url } description billingAddress { address1 city province country } }`.
- **Vì sao:** tài liệu shopify.dev (Admin GraphQL, object `Shop`) không nêu rõ quyền cho từng trường; `billingAddress` được đánh dấu deprecated. Mã đã làm đúng theo tài liệu và **chưa kiểm với cửa hàng thật**.
- **Nếu thiếu quyền:** Shopify trả `ACCESS_DENIED` → bước đề xuất chỉ ghi `shopSuggestionsSkipped` và cảnh báo mã lỗi, việc nạp sản phẩm KHÔNG hỏng. Khi đó thêm quyền còn thiếu vào ứng dụng Shopify rồi đồng bộ lại (hoặc bỏ trường bị từ chối khỏi `SHOP_QUERY` ở `packages/connectors/src/shopify/connector.ts`).
- **Việc của chủ dự án:** chạy "Đồng bộ" ở trang Cơ sở kiến thức với cửa hàng thật, xem trang Thông tin cửa hàng có hiện "Đề xuất từ Shopify" không; báo lại trường nào bị từ chối.
