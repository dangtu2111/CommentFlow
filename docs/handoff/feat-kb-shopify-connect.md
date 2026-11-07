# Handoff feat/kb-shopify-connect (claude)

**Đã làm:** khối "Kết nối Shopify Store" ở `/app/kb` chạy thật: nhập tên miền + Client ID + Client secret (Dev Dashboard) → lưu mã hóa; "Đồng bộ ngay" → job `shopify-sync` → worker đổi secret lấy token 24 giờ, kéo sản phẩm/biến thể/giá/tồn vào `products`; Ngắt kết nối; kết quả lần cuối hiện ở khối. Worker chỉ gọi Shopify khi `SHOPIFY_ENABLED=true`.

**Bổ sung (07/11):** (1) Chống bấm đúp/spam dùng bộ giới hạn tốc độ sẵn có (`packages/saas-core/src/ratelimit/limiter.ts`: `uiWrite` 1/giây + 30/phút, `uiSensitive` 1/2 giây + 10/10 phút, `uiHeavy` 1/3 giây + 1/30 giây theo workspace), bọc ở `server/action-guard.ts`, áp cho action kiến thức/Shopify/kênh; vượt → thông báo `rate_limited`. Lưu ý dev: bộ giới hạn nằm trong `globalThis.__cfAuthRuntime` nên thêm chính sách mới phải KHỞI ĐỘNG LẠI server dev (lỗi `reading buckets`). (2) Lỗi đồng bộ ghi `last_sync_summary.reason` (`<bước>:<mã>`, đã lọc ký tự, không bí mật) và giao diện giải thích nguyên nhân (`lib/shopify-reason.ts`).

**Chẩn đoán thực tế (dev, 07/11):** kết nối "Shop Thử 2" ra `catalog:shopify_access_denied` → đổi Client ID/secret lấy token THÀNH CÔNG nhưng Shopify từ chối đọc sản phẩm (thiếu quyền read_products/read_inventory hoặc chưa phát hành/cài lại phiên bản). Migration 0066: lỗi `catalog:*` giữ kết nối `connected` (sửa quyền rồi đồng bộ lại, không phải nhập lại secret); chỉ lỗi đổi token/giải mã mới đặt `invalid`. Trang tổng quan Cơ sở kiến thức chỉ đếm/hiển thị dữ liệu THẬT: `loadKbOverview` bỏ mọi dòng nhãn `[MẪU]`; ô chạy thử nhận câu hỏi thật và điền sẵn sang Thử AI (`?q=`).

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
