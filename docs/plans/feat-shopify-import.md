# Kế hoạch `feat-shopify-import` — SHOPIFY-IMPORT (FR-052)

## Việc

Mã gap matrix: `SHOPIFY-IMPORT` · Spec: `docs/12` §4 + §4.1, `docs/10` §3 (products/product_variants), FR-052/FR-122.

**Tóm tắt:** Thêm connector Shopify **chỉ đọc** (Admin GraphQL): lấy sản phẩm/biến thể/giá/tồn/chính sách cửa hàng theo trang, tôn trọng giới hạn tốc độ của Shopify, chuẩn hóa thành kế hoạch ghi cùng dạng với nhập Excel rồi ghi vào `products`/`product_variants` bằng một hàm db mới. Chưa có Shopify dev store nên mọi thứ chạy bằng dữ liệu ghi sẵn (fixture); cờ `SHOPIFY_ENABLED` mặc định tắt. Rủi ro: tên trường/phiên bản API viết theo tài liệu công khai, chưa kiểm với cửa hàng thật.

## Điểm chưa rõ

Không có (mọi điểm mơ hồ đã tự chọn phương án an toàn — ghi ở Q-SHI1).

## Tiêu chí nghiệm thu

1. Tên miền cửa hàng không đúng dạng `<tên>.myshopify.com` bị từ chối trước khi gọi mạng (chống SSRF) — test `FR-052 từ chối domain lạ`.
2. Duyệt hết sản phẩm theo con trỏ (`after`) qua nhiều trang, và biến thể > 100/sản phẩm theo trang riêng — test connector với fixture 2 trang.
3. Giới hạn tốc độ: `THROTTLED`/HTTP 429 → `PlatformError('RATE_LIMIT')` kèm `retryAfterSeconds`; chủ động chờ khi `currentlyAvailable` thấp (sleep tiêm vào, không `sleep` thật) — test.
4. Lỗi 401 → `TOKEN_EXPIRED`, 403 → `PERMISSION`; thông báo lỗi không chứa token/URL — test.
5. Chuẩn hóa: giá chỉ nhận khi tiền tệ `VND` (số nguyên đồng), tiền tệ khác → giá `null` (không quy đổi); tồn chỉ khi `tracked`; `search_text` không có giá/tồn; id biến thể = gid Shopify — test mapper + property test.
6. Chữ ký webhook `X-Shopify-Hmac-Sha256` (base64 HMAC-SHA256 thân thô) sai/thiếu bị từ chối, so sánh thời gian hằng — test.
7. `SHOPIFY_ENABLED` chỉ đúng chữ `true` mới bật — test cấu hình.
8. `applyShopifySync` ghi sản phẩm nguồn `shopify`, ghi đè giá/tồn/tên theo Shopify, đặt `locked_fields`, idempotent, chéo workspace bị RLS chặn — test tích hợp (chạy ở làn b/CI `database`).
9. `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `precheck` xanh; coverage `@flow/connectors` & `@flow/shared` không hạ ngưỡng.

## File sẽ đọc

`docs/12` §4.1; `packages/db/src/queries/product-import.ts` (mẫu upsert); `packages/shared/src/product-import/plan.ts` (kiểu kế hoạch); `packages/connectors/src/tiktok/connector.ts` (quy ước connector); `packages/connectors/src/facebook/connector.ts` (`readBoundedText`).

## File sẽ sửa / tạo

- `packages/connectors/src/shopify/{connector,normalize,webhook,fixtures}.ts` + test — client GraphQL chỉ đọc, chuẩn hóa, chữ ký webhook.
- `packages/connectors/src/index.ts` — export.
- `packages/shared/src/shopify-config.ts` (+test), `index.ts` — đọc cờ/phiên bản từ env do nơi dựng truyền vào.
- `packages/db/src/queries/product-source-sync.ts` (+ `tests/product-source-sync.int.test.ts`) — ghi sản phẩm nguồn ngoài.
- `env.example`, `docs/can-ban-cung-cap.d/`, `docs/testing/kiem-tra-tay.d/`, `docs/codemap.d/`, `docs/plans/quyet-dinh/qshi1.md`, gap-matrix/MASTER (dòng của việc), handoff.

## Migration

Không có (bảng đã có ở 0034; nguồn `shopify` đã nằm trong CHECK). Bảng lưu kết nối cửa hàng/token và job chạy → ghi gap cho làn b (`SHOPIFY-CONNECT-STORE`).

## Test viết trước

Mọi test ở trên viết trước (đỏ vì chưa có module), rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/shopify` · `pnpm --filter @flow/shared exec vitest run src/shopify-config.test.ts` · `pnpm --filter @flow/connectors test:coverage` · `pnpm --filter @flow/shared test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chữ ký webhook, xử lý token, chống SSRF). `verifier-db` không (không migration; hàm ghi không đổi RLS) .

## Rủi ro / câu hỏi cho chủ dự án

Cần Shopify dev store + app (client id/secret, scope) để chạy thật — mục riêng trong `CAN_BAN_CUNG_CAP`. OAuth cài app, đăng ký webhook, bulk operation: ngoài phạm vi (xem Q-SHI1).

## Đề xuất thay đổi

Không đổi docs/01–16 trừ ghi nhận trạng thái.

## Complexity tracking

Không có (không thêm thư viện; dùng `fetch` có sẵn và `node:crypto`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-SHI1).
