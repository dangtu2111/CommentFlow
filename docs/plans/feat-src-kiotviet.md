# Kế hoạch `feat-src-kiotviet` — SRC-KIOTVIET (FR-122)

## Việc

Mã gap matrix: `SRC-KIOTVIET` · Spec: `docs/12` §4 (bảng KiotViet) + §4.1, FR-122, mẫu `SRC-SAPO`.

**Tóm tắt:** Thêm connector KiotViet **chỉ đọc** (Public API `https://public.kiotapi.com`): lấy sản phẩm/biến thể/giá/tồn theo trang (`currentItem`/`pageSize`), xin token bằng client credentials (`https://id.kiotviet.vn/connect/token`, có bộ nhớ đệm), chuẩn hóa thành `ImportProductPlan` rồi ghi bằng `applyProductSourceSync` có sẵn (thêm nguồn `kiotviet`; CHECK đã có từ migration 0034, không migration). Chưa có tài khoản dev KiotViet nên chạy bằng fixture; cờ `KIOTVIET_ENABLED` mặc định tắt. Rủi ro: tên trường/đường dẫn viết theo tài liệu công khai (spec ghi "đối chiếu tài liệu chính thức"), chưa kiểm với shop thật.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn — Q-KIO1).

## Tiêu chí nghiệm thu

1. Connector chỉ GET `https://public.kiotapi.com/products` (máy chủ cố định), tên cửa hàng chỉ ở header `Retailer` và bị kiểm dạng (chặn chèn header), token chỉ ở `Authorization`, `redirect:'error'` — `connector.test.ts`.
2. Phân trang `currentItem`/`pageSize` đến khi trang < pageSize hoặc đủ `total`, loại trùng id, vượt `maxPages` → lỗi — `connector.test.ts`.
3. 401→TOKEN_EXPIRED, 403→PERMISSION, 429→RATE_LIMIT (+Retry-After), lỗi khác→UNKNOWN; không lộ token — `connector.test.ts`.
4. Gom biến thể theo `masterProductId`; sản phẩm không biến thể = một biến thể; mồ côi bị bỏ — `connector.test.ts`.
5. Chuẩn hóa: chỉ sản phẩm đang bán (`isActive && allowsSale`); giá chỉ khi số nguyên VND; tồn = tổng `onHand` các chi nhánh khi là số nguyên ≥ 0; searchText không có giá/tồn — `normalize.test.ts` (+ property-based).
6. Token: gọi đúng URL cố định bằng form client credentials, nhớ đến gần hết hạn, gộp lời gọi đồng thời, lỗi → mã chuẩn không lộ bí mật — `token.test.ts`.
7. Cờ `KIOTVIET_ENABLED` chỉ đúng `true` mới bật — `kiotviet-config.test.ts`.
8. Xác minh chữ ký webhook `X-Hub-Signature: sha256=<hex>` — `webhook.test.ts`.
9. `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && test:trace`, coverage `connectors`/`shared` giữ ngưỡng.

## File sẽ đọc (đã đọc)

`packages/connectors/src/sapo/*` (mẫu) · `packages/shared/src/sapo-config.ts` · `packages/db/src/queries/product-source-sync.ts`.

## File sẽ sửa / tạo

Tạo: `packages/connectors/src/kiotviet/{connector,token,normalize,webhook,fixtures}.ts` + test · `packages/shared/src/kiotviet-config.ts` + test · docs riêng.
Sửa: `packages/connectors/src/index.ts`, `packages/shared/src/index.ts`, `packages/db/src/queries/product-source-sync.ts` (chỉ kiểu nguồn), `env.example`, dòng SRC-KIOTVIET ở gap-matrix/MASTER.

## Migration

Không có. Bảng lưu Client ID/Secret + tên cửa hàng theo workspace → gap `KIOTVIET-CONNECT-STORE` (làn b).

## Test viết trước

Mọi `*.test.ts` của kiotviet + config; property-based cho `parseKiotVietMoney`, `buildKiotVietImportPlan`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/kiotviet` · `pnpm --filter @flow/shared exec vitest run src/kiotviet-config.test.ts`

## Cần kiểm chứng độc lập không?

Có chạm xử lý bí mật client + xác minh chữ ký webhook; gọi verifier-security một lần.

## Rủi ro / câu hỏi cho chủ dự án

Cần shop dev KiotViet + Client ID/Secret (PublicApi.Access) để kiểm thật — ghi ở `docs/can-ban-cung-cap.d/`.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có (lặp có chủ đích cấu trúc connector Sapo/Haravan; API mỗi nơi khác nhau).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-KIO1).
