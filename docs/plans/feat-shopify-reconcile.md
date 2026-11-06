# Kế hoạch `feat-shopify-reconcile` — SHOPIFY-RECONCILE (FR-112, FR-113)

## Việc

Mã gap matrix: `SHOPIFY-RECONCILE` · Spec: `docs/09` §7.3, `docs/12` §4.1, FR-112/FR-113.

**Tóm tắt:** Thêm phần đối soát giá/tồn/trạng thái giữa Shopify và kho nội bộ: so sánh theo `external_id`, **chỉ ghi nhận chỗ lệch để Owner duyệt, không tự sửa giá** (Q-SRC1), kiểm webhook còn đủ không, và tính cảnh báo (lệch giá → báo Owner; lệch > 5% hoặc mất webhook → báo Admin). Logic là hàm thuần; job worker chạy bằng cổng giả (mock) vì chưa có bảng lưu kết nối cửa hàng/kết quả (cần migration, chỉ làn b). Cờ `SHOPIFY_ENABLED` tắt mặc định. Rủi ro: truy vấn webhook viết theo tài liệu công khai, chưa kiểm với dev store.

## Điểm chưa rõ

Không có (mọi điểm tự chọn phương án an toàn — ghi ở Q-SRC1).

## Tiêu chí nghiệm thu

1. So khớp theo `external_id`: lệch giá, giá so sánh, tồn, tên sản phẩm → mỗi lệch một dòng `{trường, giá trị nội bộ, giá trị Shopify}`; giống nhau → không lệch — test `reconcileCatalog`.
2. Giá/tồn phía Shopify là `null` (tiền tệ không phải VND, không theo dõi tồn) → KHÔNG tính lệch (không đoán) — test.
3. Sản phẩm/biến thể đang hoạt động nội bộ nhưng không còn trong danh mục Shopify đang bán → lệch `gone_in_shopify`; có ở Shopify mà chưa có nội bộ → `new_in_shopify` (chỉ đếm, không ghi đè) — test.
4. Hàm đối soát thuần KHÔNG có đường sửa dữ liệu: kết quả chỉ là danh sách lệch + cảnh báo; cờ `needsOwnerReview` — test + review.
5. Cảnh báo: có lệch giá → báo Owner; tỷ lệ sản phẩm lệch > 5% hoặc thiếu webhook → báo Admin; không lệch → không báo — test (+ property: kết quả không phụ thuộc thứ tự đầu vào).
6. `checkWebhookTopics`: so chủ đề bắt buộc với danh sách đã đăng ký → liệt kê thiếu — test. Connector `listWebhookSubscriptions` đọc danh sách (chỉ `query`), lỗi dùng mã `PlatformError` như các hàm khác — test với fixture.
7. "Đối soát ngay" tối đa 1 lần/giờ: `canRunManualReconcile` — test biên 59'59"/60'.
8. Job `shopify-reconcile` (mock): cờ tắt → không làm gì; chạy đêm/thủ công; thủ công trong vòng 1 giờ → từ chối; ghi lần chạy + lệch qua cổng ghi; đăng ký lại webhook thiếu qua cổng; lỗi lấy dữ liệu → ném để thử lại, không ghi lần chạy dở; chạy trong `withJob` đúng workspace — test.
9. `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `precheck` xanh; coverage `@flow/shared`/`@flow/connectors` không hạ ngưỡng.

## File sẽ đọc

`docs/09` §7.3; `packages/connectors/src/shopify/{connector,fixtures}.ts`; `packages/shared/src/product-import/plan.ts`; `apps/worker/src/jobs/abuse.ts` (+test) mẫu job.

## File sẽ sửa / tạo

- `packages/shared/src/shopify-reconcile.ts` (+test), `index.ts` — logic thuần.
- `packages/connectors/src/shopify/connector.ts` (+test, fixtures), `index.ts` — `listWebhookSubscriptions`.
- `apps/worker/src/jobs/shopify-reconcile.ts` (+test) — job mock với cổng tiêm vào.
- `docs/can-ban-cung-cap.d/`, `docs/testing/kiem-tra-tay.d/`, `docs/codemap.d/`, `docs/plans/quyet-dinh/qsrc1.md`, `docs/09` §7.3, gap-matrix/MASTER (dòng của việc), handoff. Không thêm biến môi trường mới (dùng `SHOPIFY_ENABLED`).

## Migration

Không có. Cần cho làn b (`SHOPIFY-RECONCILE-STORE`): bảng `reconcile_runs`/`reconcile_diffs` (+ trạng thái duyệt), bảng kết nối cửa hàng (`SHOPIFY-CONNECT-STORE`), lịch 02:00 theo múi giờ workspace, trang Nguồn dữ liệu.

## Test viết trước

Toàn bộ test ở trên viết trước (đỏ vì chưa có module), rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/shopify-reconcile.test.ts` · `pnpm --filter @flow/connectors exec vitest run src/shopify` · `pnpm --filter @flow/worker exec vitest run src/jobs/shopify-reconcile.test.ts` · `pnpm --filter @flow/shared test:coverage` · `pnpm --filter @flow/connectors test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (job chạm token cửa hàng qua cổng, chống ghi chéo workspace, không tự sửa giá).

## Rủi ro / câu hỏi cho chủ dự án

Cần Shopify dev store + app (mục riêng trong `CAN_BAN_CUNG_CAP`). Spec §7.3 cũ ghi "cập nhật theo Shopify ngay"; đổi thành "đánh dấu để Owner duyệt" theo yêu cầu điều phối — Q-SRC1.

## Đề xuất thay đổi

Sửa `docs/09` §7.3 (Xử lý lệch) cho khớp Q-SRC1 — ghi ở file quyết định.

## Complexity tracking

Không có (không thêm thư viện; cổng tiêm vào có ≥ 2 nơi dùng: job thật sau này + mock test).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-SRC1).
