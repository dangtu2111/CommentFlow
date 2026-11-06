# Kế hoạch `feat-src-sapo` — SRC-SAPO (FR-122)

## Việc

Mã gap matrix: `SRC-SAPO` · Spec: `docs/12` §4 (bảng Sapo) + §4.1, FR-122, mẫu `SRC-HARAVAN`/`SHOPIFY-IMPORT`.

**Tóm tắt:** Thêm connector Sapo **chỉ đọc** (Sapo Web API REST, máy chủ `<tên>.mysapo.net`): lấy sản phẩm/biến thể/giá/tồn theo trang, tôn trọng bucket `X-Sapo-Api-Call-Limit`, chuẩn hóa thành `ImportProductPlan` rồi ghi bằng `applyProductSourceSync` có sẵn (mở rộng kiểu nguồn thêm `sapo`; CHECK đã có từ migration 0034, không migration). Chưa có tài khoản dev Sapo nên chạy bằng fixture; cờ `SAPO_ENABLED` mặc định tắt. Rủi ro: tên trường viết theo tài liệu công khai, chưa kiểm với shop thật.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn — Q-SAP1).

## Tiêu chí nghiệm thu

1. Connector chỉ gọi `https://<tên>.mysapo.net/admin/products.json` bằng GET, token chỉ ở header `X-Sapo-Access-Token`, `redirect:'error'`; tên miền sai dạng bị từ chối lúc dựng (chống SSRF) — `connector.test.ts`.
2. Phân trang `page`/`limit` đến khi trang < limit, loại trùng theo id, vượt `maxPages` → lỗi — `connector.test.ts`.
3. 401→TOKEN_EXPIRED, 403→PERMISSION, 429→RATE_LIMIT (+Retry-After), lỗi khác→UNKNOWN; không lộ token; chờ khi bucket gần đầy — `connector.test.ts`.
4. Chuẩn hóa: chỉ sản phẩm đã xuất bản; giá chỉ khi số nguyên VND; tồn chỉ khi quản lý tồn và ≥ 0; searchText không có giá/tồn — `normalize.test.ts` (+ property-based).
5. Cờ `SAPO_ENABLED` chỉ đúng `true` mới bật — `sapo-config.test.ts`.
6. Xác minh chữ ký webhook `X-Sapo-Hmac-Sha256` — `webhook.test.ts`.
7. `applyProductSourceSync` nhận nguồn `sapo` — `pnpm typecheck`.
8. `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && test:trace`, coverage `connectors`/`shared` giữ ngưỡng.

## File sẽ đọc (đã đọc)

`packages/connectors/src/haravan/*` (mẫu) · `packages/shared/src/haravan-config.ts` · `packages/db/src/queries/product-source-sync.ts`.

## File sẽ sửa / tạo

Tạo: `packages/connectors/src/sapo/{connector,normalize,webhook,fixtures}.ts` + test · `packages/shared/src/sapo-config.ts` + test · docs riêng.
Sửa: `packages/connectors/src/index.ts`, `packages/shared/src/index.ts`, `packages/db/src/queries/product-source-sync.ts` (chỉ kiểu nguồn), `env.example`, dòng SRC-SAPO ở gap-matrix/MASTER.

## Migration

Không có. Bảng kết nối cửa hàng/token + OAuth → gap `SAPO-CONNECT-STORE` (làn b).

## Test viết trước

Mọi `*.test.ts` của sapo + config; property-based cho `parseSapoMoney`, `buildSapoImportPlan`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/sapo` · `pnpm --filter @flow/shared exec vitest run src/sapo-config.test.ts`

## Cần kiểm chứng độc lập không?

Không chạm auth/RLS/thanh toán/cổng tự gửi; chỉ xác minh chữ ký webhook + xử lý token (đọc, không lưu) + kiểm tên miền chống SSRF. Gọi verifier-security một lần.

## Rủi ro / câu hỏi cho chủ dự án

Cần tài khoản/shop dev Sapo + app (scope đọc sản phẩm, tồn kho) để kiểm thật — ghi ở `docs/can-ban-cung-cap.d/`.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có (lặp có chủ đích cấu trúc connector Haravan/Shopify; chưa gom chung vì API mỗi nơi khác nhau — header token, tên trường, tên miền).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-SAP1).
