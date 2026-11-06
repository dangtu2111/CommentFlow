# Kế hoạch `feat-src-pancake` — SRC-PANCAKE (FR-122)

## Việc

Mã gap matrix: `SRC-PANCAKE` · Spec: `docs/12` §4 (bảng Pancake POS) + §4.1, FR-122, mẫu `SRC-KIOTVIET`.

**Tóm tắt:** Thêm connector Pancake POS **chỉ đọc** (Open API `https://pos.pages.fm/api/v1`): lấy sản phẩm/biến thể/giá/tồn theo trang (`page_number`/`page_size`), xác thực bằng API key của shop, chuẩn hóa thành `ImportProductPlan` rồi ghi bằng `applyProductSourceSync` có sẵn (thêm nguồn `pancake`; CHECK đã có từ migration 0034, không migration). Chưa có shop dev Pancake nên chạy bằng fixture; cờ `PANCAKE_ENABLED` mặc định tắt. Rủi ro: spec ghi tài liệu công khai chưa rõ; tên trường/đường dẫn viết theo https://docs.pancake.vn/, chưa kiểm với shop thật; API key nằm ở query nên phải không bao giờ log/ném URL.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn — Q-PAN1).

## Tiêu chí nghiệm thu

1. Connector chỉ GET `https://pos.pages.fm/api/v1/shops/{id}/products` (máy chủ cố định), mã shop bị kiểm dạng số, khóa chỉ ở `api_key` (không ở header), `redirect:'error'` — `connector.test.ts`.
2. Phân trang `page_number`/`page_size` đến `total_pages` (hoặc trang ngắn/trống), loại trùng id, trang đầy không dòng mới và vượt `maxPages` → lỗi — `connector.test.ts`.
3. 401→TOKEN_EXPIRED, 403→PERMISSION, 429→RATE_LIMIT (+Retry-After), lỗi khác→UNKNOWN; lỗi mạng/khóa hỏng không lộ khóa/URL — `connector.test.ts`.
4. Sản phẩm → biến thể từ `variations`; trường thiếu → `null`/rỗng; ẩn → không bán — `connector.test.ts`.
5. Chuẩn hóa: bỏ sản phẩm/biến thể ẩn; giá chỉ khi số nguyên VND; tồn chỉ khi nguyên ≥ 0, tổng khi mọi biến thể có tồn; searchText không có giá/tồn — `normalize.test.ts` (+ property-based).
6. Cờ `PANCAKE_ENABLED` chỉ đúng `true` mới bật — `pancake-config.test.ts`.
7. `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && test:trace`, coverage `connectors`/`shared` giữ ngưỡng.

## File sẽ đọc (đã đọc)

`packages/connectors/src/kiotviet/{connector,normalize,fixtures}.ts` (mẫu) · `packages/shared/src/kiotviet-config.ts` · `docs/plans/feat-src-kiotviet.md`.

## File sẽ sửa / tạo

Tạo: `packages/connectors/src/pancake/{connector,normalize,fixtures}.ts` + test · `packages/shared/src/pancake-config.ts` + test · docs riêng.
Sửa: `packages/connectors/src/index.ts`, `packages/shared/src/index.ts`, `packages/db/src/queries/product-source-sync.ts` (chỉ kiểu nguồn), `env.example`, dòng SRC-PANCAKE ở gap-matrix/MASTER.

## Migration

Không có. Bảng lưu mã shop + API key theo workspace → gap `PANCAKE-CONNECT-STORE` (làn b).

## Test viết trước

Mọi `*.test.ts` của pancake + config; property-based cho `parsePancakeMoney`, `buildPancakeImportPlan`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/pancake` · `pnpm --filter @flow/shared exec vitest run src/pancake-config.test.ts`

## Cần kiểm chứng độc lập không?

Có chạm xử lý bí mật (API key nằm ở URL); gọi verifier-security một lần.

## Rủi ro / câu hỏi cho chủ dự án

Cần shop dev Pancake POS + API key để kiểm thật — ghi ở `docs/can-ban-cung-cap.d/`.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có (lặp có chủ đích cấu trúc connector KiotViet; API mỗi nơi khác nhau).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-PAN1).
