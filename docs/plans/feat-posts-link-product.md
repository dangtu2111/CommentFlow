# Kế hoạch `feat-posts-link-product` — Gắn sản phẩm vào bài (làn b, có migration 0047)

## Việc

Mã gap matrix: `POSTS-LINK-PRODUCT` · Spec: FR-061 (docs/05), US-032, docs/10 §3.2 `post_products`.

**Tóm tắt:** thêm bảng liên kết bài ↔ sản phẩm (`cf.post_products`) để một bài gắn nhiều sản phẩm, đánh dấu một sản phẩm chính, gắn hàng loạt nhiều bài × nhiều sản phẩm. Gợi ý của AI chỉ là "đề xuất" (`suggested`) — chưa được dùng để trả lời cho tới khi nhân viên bấm xác nhận. Rủi ro: lộ chéo workspace và AI tự xác nhận → chặn bằng RLS + CHECK + test chéo workspace. Phần giao diện (nút gắn, lọc, banner) thuộc `POSTS-LIST-LINK-FILTER`, không làm ở nhánh này.

## Điểm chưa rõ

Không có (quyết định ghi ở Q-PLP1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Bài gắn được ≥ 2 sản phẩm; tối đa một sản phẩm chính mỗi bài — kiểm bằng `post-products.int.test.ts` (chỉ mục duy nhất từng phần).
2. Sản phẩm chính phải là liên kết đã xác nhận (CHECK) và "chính hiệu lực" suy ra đúng khi chỉ có một liên kết — kiểm bằng `post-products.test.ts`.
3. Gắn hàng loạt N bài × M sản phẩm trong một giao dịch, không trùng, nâng đề xuất lên xác nhận — kiểm bằng test tích hợp.
4. Đề xuất AI (`suggested`) KHÔNG nằm trong `productIdsForAnswering`; hệ thống/AI không thể tự tạo liên kết `confirmed`; xác nhận gắn `confirmed_by` = người đang thao tác (không giả được) — test tích hợp RLS.
5. Chéo workspace: workspace khác không thấy/ghi/xóa; người ngoài bị chặn; sản phẩm/bài khác workspace → lỗi khóa ngoại — test tích hợp; `pnpm db:check-rls` đạt.
6. Phủ test gói `shared` giữ ngưỡng — `pnpm --filter @flow/shared test:coverage`.

## File sẽ đọc

`post-notes.ts` (shared/db/schema/queries) và `product-aliases` (mẫu RLS), `check-rls.ts` (kỳ vọng), `docs/10` §3.2 — đã đọc.

## File sẽ sửa / tạo

- `packages/shared/src/post-products.ts` (+ test, export ở `index.ts`) — Zod + quy tắc thuần.
- `packages/db/src/schema/cf/post-products.ts` (+ `index.ts`) — bảng.
- `packages/db/migrations/0047_post_products.sql` (+ snapshot/journal do drizzle-kit).
- `packages/db/src/queries/post-products.ts` — truy vấn.
- `packages/db/src/check-rls.ts` — kỳ vọng GRANT/policy.
- `packages/db/tests/post-products.int.test.ts` — tích hợp.
- `docs/10`, `codemap`, `gap-matrix`, `MASTER`, `QUYET_DINH`, `CAN_BAN_CUNG_CAP`, `KIEM_TRA_TAY`, handoff.

## Migration

0047: `cf.post_products` (PK workspace_id+post_id+product_id; FK ghép tới `posts`/`products` ON DELETE cascade; `status` suggested|confirmed; `is_primary`; `suggested_by_ai`; `confirmed_by`). Đường lùi: `DROP TABLE cf.post_products`.

## Test viết trước

`post-products.test.ts` (đỏ trước khi có mã), sau đó test tích hợp.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/post-products.test.ts` · `CF_LANE=b pnpm test:db` · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration/RLS) một lần; chứa cơ chế "AI không tự xác nhận" nên kèm `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Giao diện gắn/lọc chưa làm (gap `POSTS-LIST-LINK-FILTER`).

## Đề xuất thay đổi

docs/10 §3.2: `post_products` thêm `status`, `created_at`, `updated_at`.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa rõ
- [x] Tiêu chí nghiệm thu kiểm được
- [x] Đã xác định file đọc/sửa
- [x] Migration có đường lùi

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/Q-PLP1)
