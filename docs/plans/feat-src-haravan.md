# Kế hoạch `feat-src-haravan` — SRC-HARAVAN (FR-122)

## Việc

Mã gap matrix: `SRC-HARAVAN` · Spec: `docs/12` §4 (bảng Haravan) + §4.1, FR-122, mẫu `SHOPIFY-IMPORT`.

**Tóm tắt:** Thêm connector Haravan **chỉ đọc** (Omni API `apis.haravan.com/com`): lấy sản phẩm/biến thể/giá/tồn theo trang, tôn trọng giới hạn tốc độ (bucket `X-Haravan-Api-Call-Limit`), chuẩn hóa thành `ImportProductPlan` rồi ghi bằng hàm `applyProductSourceSync` có sẵn (mở rộng kiểu nguồn thêm `haravan`; cột/CHECK đã có từ migration 0034, không migration). Chưa có tài khoản dev Haravan nên chạy bằng fixture; cờ `HARAVAN_ENABLED` mặc định tắt. Rủi ro: tên trường viết theo tài liệu công khai, chưa kiểm với shop thật.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn — Q-HRV1).

## Tiêu chí nghiệm thu

1. Connector chỉ gọi `https://apis.haravan.com/com/products.json` bằng GET, token Bearer chỉ ở header, `redirect:'error'` — kiểm bằng `connector.test.ts`.
2. Phân trang `page`/`limit` đến khi trang < limit, loại trùng theo id, vượt `maxPages` → lỗi (không trả dang dở) — `connector.test.ts`.
3. 401→TOKEN_EXPIRED, 403→PERMISSION, 429→RATE_LIMIT (+Retry-After), lỗi khác→UNKNOWN; không lộ token trong lỗi; chờ khi bucket gần đầy — `connector.test.ts`.
4. Chuẩn hóa: chỉ sản phẩm đã xuất bản; giá chỉ khi số nguyên VND hợp lệ; tồn chỉ khi shop quản lý tồn và ≥ 0; thuộc tính từ `options` + `option1..3`; searchText không có giá/tồn — `normalize.test.ts` (+ property-based).
5. Cờ `HARAVAN_ENABLED` chỉ đúng `true` mới bật — `haravan-config.test.ts`.
6. Xác minh chữ ký webhook `X-Haravan-Hmac-Sha256` (HMAC base64 thân thô, thời gian hằng) — `webhook.test.ts`.
7. `applyProductSourceSync` nhận nguồn `haravan` (kiểu) — `pnpm typecheck`.
8. `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && test:trace`, `test:coverage` gói `connectors` và `shared` giữ ngưỡng.

## File sẽ đọc (đã đọc)

`packages/connectors/src/shopify/{connector,normalize,webhook,fixtures}.ts` (mẫu) · `packages/shared/src/shopify-config.ts` · `packages/db/src/queries/product-source-sync.ts` · `packages/db/src/schema/cf/products.ts` (enum nguồn đã có `haravan`).

## File sẽ sửa / tạo

Tạo: `packages/connectors/src/haravan/{connector,normalize,webhook,fixtures}.ts` + test · `packages/shared/src/haravan-config.ts` + test · docs riêng (codemap.d, quyet-dinh/qhrv1.md, can-ban-cung-cap.d, kiem-tra-tay.d, handoff).
Sửa: `packages/connectors/src/index.ts`, `packages/shared/src/index.ts` (export), `packages/db/src/queries/product-source-sync.ts` (kiểu nguồn), `env.example`, dòng SRC-HARAVAN ở gap-matrix/MASTER.

## Migration

Không có (`products_source_check` đã gồm `haravan`). Bảng lưu kết nối cửa hàng/token + OAuth → gap `HARAVAN-CONNECT-STORE` (làn b).

## Test viết trước

Toàn bộ `*.test.ts` của haravan + config viết trước khi có code; property-based cho `parseHaravanMoney` và `buildHaravanImportPlan`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/haravan` · `pnpm --filter @flow/shared exec vitest run src/haravan-config.test.ts`

## Cần kiểm chứng độc lập không?

Không chạm auth/RLS/thanh toán/cổng tự gửi; chỉ có xác minh chữ ký webhook + xử lý token (đọc, không lưu). Gọi verifier-security một lần cho phần token/webhook theo yêu cầu điều phối.

## Rủi ro / câu hỏi cho chủ dự án

Cần tài khoản dev Haravan + app (scope `com.read_products`, `com.read_inventories`) để kiểm thật — ghi ở `docs/can-ban-cung-cap.d/`.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có (lặp có chủ đích cấu trúc connector Shopify; chưa gom chung vì mới 2 nơi và API khác hẳn — REST vs GraphQL).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-HRV1).
