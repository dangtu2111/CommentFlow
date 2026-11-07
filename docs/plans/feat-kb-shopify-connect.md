# Kế hoạch `feat-kb-shopify-connect` — Cơ sở kiến thức: kết nối Shopify bằng Client ID/secret và nạp sản phẩm

> Trạng thái duyệt: **Đã duyệt** (chủ dự án giao việc 07/11/2026: "bắt đầu với cài đặt kết nối Shopify và nạp dữ liệu từ Shopify vào cơ sở kiến thức"; cách kết nối: Client ID + Client secret của ứng dụng Dev Dashboard).

## Việc

Mã gap matrix: `SHOPIFY-CONNECT-STORE` · Spec: FR-052, `docs/12` §4, `design/stitch/knowledge-base.png`.

**Tóm tắt:** Owner nhập tên miền `<tên>.myshopify.com` + Client ID + Client secret ở khối "Kết nối Shopify Store" (trang Nguồn dữ liệu). Client secret được mã hóa (AES-256-GCM, `TOKEN_ENC_KEYS`) và chỉ hệ thống đọc được. Nút "Đồng bộ ngay" đẩy job `shopify-sync`; worker giải mã secret, ĐỔI lấy token Admin API (luồng client credentials, token sống 24 giờ, không refresh) rồi gọi Admin GraphQL chỉ đọc, chuẩn hóa và upsert vào `products`/`product_variants` (không xóa sản phẩm vắng mặt). Mọi lỗi thành kết quả hiển thị (ok / token_invalid / error / unavailable). Worker chỉ gọi Shopify khi cờ `SHOPIFY_ENABLED=true` (mặc định tắt). Chưa gọi Shopify thật trong test (phản hồi giả theo tài liệu).

## Điểm chưa rõ

Không có. (Đã chốt: dùng client credentials, không OAuth cài app công khai; chưa nạp chính sách cửa hàng; "Cài đặt phạm vi" để "Sắp có".)

## Tiêu chí nghiệm thu

1. Bảng/hàm DB: Owner lưu/ngắt/yêu cầu đồng bộ, chỉ hệ thống đọc ciphertext và ghi kết quả, web không đọc được cột secret, cô lập workspace, tên miền/Client ID sai bị từ chối, thời gian chờ nguyên tử — kiểm bằng: `shopify-store.int.test.ts`, `check-rls`.
2. Đổi Client ID/secret lấy token đúng điểm cuối, mã lỗi 400/401→hỏng, 403→quyền, 429→giới hạn, lỗi mạng→tạm; bí mật không vào URL/lỗi — kiểm bằng: `connectors/src/shopify/auth.test.ts` (độ phủ 100%).
3. Worker: cờ tắt không gọi Shopify; secret hỏng/sai AAD → token_invalid; lỗi tạm không hạ trạng thái; không log secret/token — kiểm bằng: `shopify-sync.test.ts`, `shopify-sync.int.test.ts` (đầu-cuối, upsert không nhân đôi).
4. Web: kiểm đầu vào, mã hóa với AAD đúng workspace, chỉ Owner, thời gian chờ, dịch mã lỗi — kiểm bằng: `shopify-connect-form.test.ts`, `shopify-connect.test.ts`, `require-app-user.scan.test.ts`.
5. Giao diện kết nối/ngắt chạy thật vi + en, secret không hiện lại — kiểm bằng: E2E `kb-content.spec.ts`.
6. Công cụ xanh — kiểm bằng: `pnpm precheck`, `pnpm lint:i18n`, CI.

## File sẽ đọc

`packages/connectors/src/shopify/*`, `packages/db/src/queries/product-source-sync.ts`, `packages/db/migrations/0020`, `apps/worker/src/{main.ts,config.ts,jobs/channel-check.ts}`, `apps/web/src/components/kb/*`.

## File sẽ sửa / tạo

Migration `0064_shopify_stores.sql`, `0065_shopify_client_credentials.sql`; `packages/db/src/shopify-store.ts`; `packages/connectors/src/shopify/auth.ts`; `packages/shared/src/queues.ts`; worker: `jobs/shopify-sync.ts`, `main.ts`, `config.ts`, `queue/definitions.ts`; web: `kb/shopify-actions.ts`, `components/kb/shopify-card.tsx`, `kb/page.tsx`, `server/shopify-{connect,runtime}.ts`, `lib/shopify-connect-form.ts`, i18n, `scripts/lib/e2e-env.mjs`, `e2e/tests/kb-content.spec.ts`.

## Migration

`0064` (bảng + RLS + hàm) và `0065` (đổi sang client credentials: cột `client_secret_enc`, `client_id`, hàm mới). Đường lùi ghi đầu mỗi file.

## Test viết trước

`shopify-store.int.test.ts`, `auth.test.ts`, `shopify-sync.test.ts`, `shopify-sync.int.test.ts`, `shopify-connect*.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/shopify-store.int.test.ts` · `pnpm --filter @flow/connectors run test:coverage` · `pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/shopify-sync.int.test.ts` · `FB_OAUTH_ENABLED=false node scripts/e2e.mjs tests/kb-content.spec.ts`
