# Handoff feat/kb-shopify-connect (claude)

**Đã làm:** khối "Kết nối Shopify Store" ở `/app/kb` chạy thật: nhập tên miền + Client ID + Client secret (Dev Dashboard) → lưu mã hóa; "Đồng bộ ngay" → job `shopify-sync` → worker đổi secret lấy token 24 giờ, kéo sản phẩm/biến thể/giá/tồn vào `products`; Ngắt kết nối; kết quả lần cuối hiện ở khối. Worker chỉ gọi Shopify khi `SHOPIFY_ENABLED=true`.

**File đã đọc + điều rút ra:**
- Phần Shopify sẵn có (`createShopifyConnector`, `buildShopifyImportPlan`, `applyProductSourceSync`) đủ cho nạp sản phẩm; thiếu nơi lưu kết nối + job + giao diện.
- Ban đầu thiết kế dùng token Admin cố định (0064); chủ dự án nói Shopify nay kết nối bằng Client ID/secret → đổi sang client credentials (0065): `POST https://{shop}.myshopify.com/admin/oauth/access_token` (form `grant_type=client_credentials`), token `expires_in` 86399 giây, KHÔNG refresh → lưu secret (mã hóa) và đổi token ở mỗi lần đồng bộ. Chỉ chạy khi ứng dụng và cửa hàng cùng tổ chức Dev Dashboard.
- Mẫu bảo mật lấy từ token kênh (0020): ghi qua hàm DEFINER (Owner/hệ thống), đọc ciphertext chỉ `withJob`; AAD = workspace + khóa `shopify` (`SHOPIFY_TOKEN_KEY` dùng chung web/worker ở `@flow/shared`).
- Hàng đợi mới `shopify-sync` cần `pnpm --filter @flow/worker queue:install` ở mỗi môi trường (CI job Database đã có bước này).
- `connectors` có ngưỡng độ phủ hàm 100%: mọi hàm mới (`auth.ts`) phải có test.
- E2E tự sinh `TOKEN_ENC_KEYS` dùng một lần khi môi trường chưa có (`scripts/lib/e2e-env.mjs`); chạy local khi `.env` bật Facebook: đặt `FB_OAUTH_ENABLED=false`.

**Đã chạy thật:** `shopify-store.int.test.ts` 17, `auth.test.ts` (connectors 828 test, độ phủ hàm 100%), `shopify-sync.test.ts` 12 + `shopify-sync.int.test.ts` 6 (đầu-cuối với phản hồi Shopify giả), web 742, `check-rls` đạt, E2E `kb-content` 14/14 (vi+en, gồm Shopify). Thử tay: kết nối giả → đồng bộ (đẩy job) → chặn bấm dồn → ngắt kết nối.

**Chưa kiểm:** gọi Shopify THẬT (cần Client ID/secret thật + ứng dụng đã cài vào cửa hàng cùng tổ chức, `SHOPIFY_ENABLED=true`, worker chạy); phản hồi thật có thể khác fixture (kiểm quyền `read_products`/`read_inventory`, lỗi `shop_not_permitted`).

**Còn lại:** nạp chính sách cửa hàng Shopify (`policy_items` chưa có mã ngoài để tránh ghi đè bản nhập tay); webhook cập nhật tức thì + đối soát (`SHOPIFY-RECONCILE-STORE`); "Cài đặt phạm vi"; lịch đồng bộ định kỳ; OAuth cài app công khai (nếu cần bán cho nhiều cửa hàng).
